// biome-ignore lint/style/noExcessiveLinesPerFile: Lifecycle scenarios share one isolated Git-worktree fixture and assert the public command contract end to end.
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lifecycleScript = join(import.meta.dir, "lifecycle.ts");
const sandboxes = [];

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "lirna-lifecycle-test-"));
  sandboxes.push(root);
  const checkoutPath = join(root, "checkout");
  const stateHome = join(root, "state");
  const git = Bun.spawn(["git", "init", "--quiet", checkoutPath], {
    stderr: "pipe",
  });
  expect(await git.exited).toBe(0);
  await copyFile(
    join(import.meta.dir, "..", ".gitignore"),
    join(checkoutPath, ".gitignore"),
  );
  return { checkoutPath, stateHome };
}

async function runLifecycle(
  command,
  { checkoutPath, dockerBin, dockerLog, stateHome },
) {
  const child = Bun.spawn(command, {
    cwd: checkoutPath,
    env: {
      ...process.env,
      LIRNA_DOCKER_LOG: dockerLog,
      PATH: dockerBin ? `${dockerBin}:${process.env.PATH}` : process.env.PATH,
      XDG_STATE_HOME: stateHome,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
}

async function lifecycle(context, ...args) {
  return runLifecycle(["bun", lifecycleScript, ...args], context);
}

async function publicLifecycle(context, ...args) {
  await mkdir(join(context.checkoutPath, "scripts"), { recursive: true });
  await Promise.all([
    copyFile(
      lifecycleScript,
      join(context.checkoutPath, "scripts/lifecycle.ts"),
    ),
    copyFile(
      join(import.meta.dir, "..", "package.json"),
      join(context.checkoutPath, "package.json"),
    ),
  ]);
  return runLifecycle(
    ["bun", "run", "--silent", "lifecycle", ...args],
    context,
  );
}

async function linkedWorktree(context) {
  for (const args of [
    ["-C", context.checkoutPath, "config", "user.email", "test@example.com"],
    ["-C", context.checkoutPath, "config", "user.name", "Lifecycle Test"],
    [
      "-C",
      context.checkoutPath,
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "initial",
    ],
  ]) {
    const git = Bun.spawn(["git", ...args], { stderr: "pipe" });
    expect(await git.exited).toBe(0);
  }
  const checkoutPath = join(context.checkoutPath, "..", "linked");
  const git = Bun.spawn(
    [
      "git",
      "-C",
      context.checkoutPath,
      "worktree",
      "add",
      "--quiet",
      "--detach",
      checkoutPath,
    ],
    { stderr: "pipe" },
  );
  expect(await git.exited).toBe(0);
  return { ...context, checkoutPath };
}

async function databaseDocker(context, health = "healthy") {
  const dockerBin = join(context.checkoutPath, "bin");
  const dockerLog = join(context.checkoutPath, "docker.log");
  await mkdir(dockerBin);
  await writeFile(
    join(dockerBin, "docker"),
    `#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";

const args = process.argv.slice(2);
await appendFile(process.env.LIRNA_DOCKER_LOG, JSON.stringify(args) + "\\n");
if (args.includes("ps"))
  process.stdout.write(JSON.stringify({ Health: "${health}", State: "running" }));
`,
    { mode: 0o755 },
  );
  return { ...context, dockerBin, dockerLog };
}

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

test("diagnoses an unregistered primary checkout without writing local state", async () => {
  const context = await sandbox();

  const result = await publicLifecycle(context, "diagnose");

  expect(result).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: ["Run `bun run lifecycle register` from this checkout."],
        checkoutKind: "primary",
        checkoutPath: context.checkoutPath,
        identity: null,
        issues: ["This primary checkout is not registered."],
        registrationState: "unregistered",
      },
      null,
      2,
    )}\n`,
  });
  expect(existsSync(context.stateHome)).toBe(false);
});

test("refuses a relative XDG state home instead of writing into the checkout", async () => {
  const context = await sandbox();
  context.stateHome = ".local-state";

  const registration = await lifecycle(context, "register");
  const diagnosis = await lifecycle(context, "diagnose");

  expect(registration).toEqual({
    exitCode: 1,
    stderr: "XDG_STATE_HOME must be an absolute path.\n",
    stdout: "",
  });
  expect(diagnosis).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [
          "Set XDG_STATE_HOME to an absolute path, then run `bun run lifecycle diagnose` again.",
        ],
        checkoutKind: "primary",
        checkoutPath: context.checkoutPath,
        identity: null,
        issues: ["XDG_STATE_HOME must be an absolute path."],
        registrationState: "invalid",
      },
      null,
      2,
    )}\n`,
  });
  expect(existsSync(join(context.checkoutPath, context.stateHome))).toBe(false);
});

test("registers a primary checkout idempotently with a stable local identity", async () => {
  const context = await sandbox();

  const [first, competing] = await Promise.all([
    lifecycle(context, "register"),
    lifecycle(context, "register"),
  ]);
  const second = await lifecycle(context, "register");
  const diagnosis = await lifecycle(context, "diagnose");

  expect(first.exitCode).toBe(0);
  expect(first.stderr).toBe("");
  const registration = JSON.parse(first.stdout);
  expect(registration).toEqual({
    checkoutKind: "primary",
    checkoutPath: context.checkoutPath,
    identity: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ),
    registrationState: "registered",
  });
  expect(competing).toEqual(first);
  expect(second).toEqual(first);
  expect(diagnosis).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [],
        checkoutKind: "primary",
        checkoutPath: context.checkoutPath,
        identity: registration.identity,
        issues: [],
        registrationState: "registered",
      },
      null,
      2,
    )}\n`,
  });
  expect(
    JSON.parse(
      await readFile(
        join(context.stateHome, "lirna", "lifecycle.json"),
        "utf8",
      ),
    ),
  ).toEqual({
    environments: [
      {
        checkoutPath: context.checkoutPath,
        identity: registration.identity,
        ports: { server: 3000, tools: {}, web: 3001 },
      },
    ],
    primary: {
      checkoutPath: context.checkoutPath,
      identity: registration.identity,
    },
    version: 2,
  });
  expect(existsSync(join(context.checkoutPath, "lifecycle.json"))).toBe(false);
  expect(
    JSON.parse(
      await readFile(
        join(context.checkoutPath, ".lirna", "environment.json"),
        "utf8",
      ),
    ),
  ).toEqual({
    checkoutPath: context.checkoutPath,
    databaseName: `lirna_${registration.identity.replaceAll("-", "")}`,
    identity: registration.identity,
    ports: { server: 3000, tools: {}, web: 3001 },
    urls: {
      server: "http://127.0.0.1:3000",
      tools: {},
      web: "http://127.0.0.1:3001",
    },
    version: 1,
  });
  const ignored = Bun.spawn(
    [
      "git",
      "-C",
      context.checkoutPath,
      "check-ignore",
      ".lirna/environment.json",
    ],
    { stderr: "pipe", stdout: "pipe" },
  );
  expect(await ignored.exited).toBe(0);
});

test("atomically allocates distinct environments and regenerates config idempotently", async () => {
  const primary = await sandbox();
  await publicLifecycle(primary, "register");
  const first = await linkedWorktree(primary);
  const secondPath = join(primary.checkoutPath, "..", "linked-two");
  const addSecond = Bun.spawn(
    [
      "git",
      "-C",
      primary.checkoutPath,
      "worktree",
      "add",
      "--quiet",
      "--detach",
      secondPath,
    ],
    { stderr: "pipe" },
  );
  expect(await addSecond.exited).toBe(0);
  const second = { ...primary, checkoutPath: secondPath };

  const [firstAllocation, secondAllocation] = await Promise.all([
    lifecycle(primary, "allocate", first.checkoutPath, "--tool", "studio"),
    lifecycle(primary, "allocate", second.checkoutPath, "--tool", "studio"),
  ]);

  expect(firstAllocation.exitCode).toBe(0);
  expect(secondAllocation.exitCode).toBe(0);
  const environments = [
    JSON.parse(firstAllocation.stdout),
    JSON.parse(secondAllocation.stdout),
  ];
  const allocatedPorts = environments.flatMap(({ ports }) => [
    ports.server,
    ports.web,
    ports.tools.studio,
  ]);
  expect(new Set(allocatedPorts).size).toBe(allocatedPorts.length);
  for (const environment of environments) {
    expect(environment.databaseName).toBe(
      `lirna_${environment.identity.replaceAll("-", "")}`,
    );
    expect(environment.urls).toEqual({
      server: `http://127.0.0.1:${environment.ports.server}`,
      tools: {
        studio: `http://127.0.0.1:${environment.ports.tools.studio}`,
      },
      web: `http://127.0.0.1:${environment.ports.web}`,
    });
  }

  const allocated = environments.find(
    ({ checkoutPath }) => checkoutPath === first.checkoutPath,
  );
  const configPath = join(first.checkoutPath, ".lirna", "environment.json");
  const originalConfig = await readFile(configPath, "utf8");
  await rm(configPath);
  const regenerated = await lifecycle(
    primary,
    "allocate",
    first.checkoutPath,
    "--tool",
    "studio",
  );
  expect(regenerated).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `${JSON.stringify(allocated, null, 2)}\n`,
  });
  expect(await readFile(configPath, "utf8")).toBe(originalConfig);
});

test("upgrades version 1 registration without changing its identity", async () => {
  const context = await sandbox();
  const path = join(context.stateHome, "lirna", "lifecycle.json");
  const identity = "12345678-1234-4123-8123-123456789abc";
  await mkdir(join(context.stateHome, "lirna"), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({
      primary: { checkoutPath: context.checkoutPath, identity },
      version: 1,
    })}\n`,
  );

  const registration = await lifecycle(context, "register");
  const diagnosis = await lifecycle(context, "diagnose");

  expect(JSON.parse(registration.stdout).identity).toBe(identity);
  expect(JSON.parse(diagnosis.stdout).identity).toBe(identity);
  const registry = JSON.parse(await readFile(path, "utf8"));
  expect(registry.version).toBe(2);
  expect(registry.environments[0].identity).toBe(identity);
});

test("diagnoses invalid local state without exposing its contents or changing it", async () => {
  const context = await sandbox();
  const path = join(context.stateHome, "lirna", "lifecycle.json");
  const invalidState = `${JSON.stringify({
    primary: {
      checkoutPath: context.checkoutPath,
      identity: "do-not-print",
    },
    version: 1,
  })}\n`;
  await mkdir(join(context.stateHome, "lirna"), { recursive: true });
  await writeFile(path, invalidState);

  const result = await lifecycle(context, "diagnose");

  expect(result).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [
          `Repair or remove the lifecycle registry at ${path}, then run \`bun run lifecycle register\`.`,
        ],
        checkoutKind: "primary",
        checkoutPath: context.checkoutPath,
        identity: null,
        issues: [
          "The lifecycle registry is unreadable or has an unsupported structure.",
        ],
        registrationState: "invalid",
      },
      null,
      2,
    )}\n`,
  });
  expect(result.stdout).not.toContain("do-not-print");
  expect(await readFile(path, "utf8")).toBe(invalidState);
});

test("identifies an unmanaged linked worktree after primary registration", async () => {
  const primary = await sandbox();
  expect((await lifecycle(primary, "register")).exitCode).toBe(0);
  const context = await linkedWorktree(primary);

  const diagnosis = await lifecycle(context, "diagnose");
  const registration = await lifecycle(context, "register");

  expect(diagnosis).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [
          `Manage this linked worktree from the registered primary checkout at ${primary.checkoutPath}.`,
        ],
        checkoutKind: "linked-worktree",
        checkoutPath: context.checkoutPath,
        identity: null,
        issues: ["This linked worktree is not registered."],
        registrationState: "unregistered",
      },
      null,
      2,
    )}\n`,
  });
  expect(registration).toEqual({
    exitCode: 1,
    stderr: "Only the primary checkout can be registered.\n",
    stdout: "",
  });
});

test("diagnoses a registry owned by a different primary checkout", async () => {
  const registered = await sandbox();
  const other = await sandbox();
  other.stateHome = registered.stateHome;
  expect((await lifecycle(registered, "register")).exitCode).toBe(0);

  const diagnosis = await lifecycle(other, "diagnose");

  expect(diagnosis).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [
          `Use the registered primary checkout at ${registered.checkoutPath}, or resolve its stale registration before continuing.`,
        ],
        checkoutKind: "primary",
        checkoutPath: other.checkoutPath,
        identity: null,
        issues: [
          `The lifecycle registry belongs to a different primary checkout at ${registered.checkoutPath}.`,
        ],
        registrationState: "conflict",
      },
      null,
      2,
    )}\n`,
  });
});

test("starts the shared PostgreSQL service idempotently through the primary checkout", async () => {
  const context = await databaseDocker(await sandbox());
  expect((await publicLifecycle(context, "register")).exitCode).toBe(0);

  const first = await publicLifecycle(context, "database", "start");
  const second = await publicLifecycle(context, "database", "start");

  const report = {
    endpoint: "127.0.0.1:5433",
    primaryCheckoutPath: context.checkoutPath,
    serviceState: "reachable",
  };
  expect(first).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `${JSON.stringify(report, null, 2)}\n`,
  });
  expect(second).toEqual(first);
  const calls = (await readFile(context.dockerLog, "utf8"))
    .trim()
    .split("\n")
    .map((call) => JSON.parse(call));
  expect(calls.filter((call) => call.includes("up"))).toEqual([
    [
      "compose",
      "--project-directory",
      context.checkoutPath,
      "--file",
      join(context.checkoutPath, "docker-compose.yml"),
      "up",
      "--detach",
      "--wait",
      "postgres",
    ],
    [
      "compose",
      "--project-directory",
      context.checkoutPath,
      "--file",
      join(context.checkoutPath, "docker-compose.yml"),
      "up",
      "--detach",
      "--wait",
      "postgres",
    ],
  ]);
});

test("diagnoses an unreachable shared PostgreSQL service without changing state or exposing credentials", async () => {
  const context = await databaseDocker(await sandbox(), "starting");
  expect((await lifecycle(context, "register")).exitCode).toBe(0);
  const registryPath = join(context.stateHome, "lirna", "lifecycle.json");
  const before = await readFile(registryPath, "utf8");

  const diagnosis = await publicLifecycle(context, "database", "diagnose");

  expect(diagnosis).toEqual({
    exitCode: 1,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        endpoint: "127.0.0.1:5433",
        primaryCheckoutPath: context.checkoutPath,
        serviceState: "unreachable",
      },
      null,
      2,
    )}\n`,
  });
  expect(await readFile(registryPath, "utf8")).toBe(before);
  expect(diagnosis.stdout).not.toContain("password");
  expect(await readFile(context.dockerLog, "utf8")).not.toContain("password");
});
