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
  {
    checkoutPath,
    databaseUrl,
    dockerBin,
    dockerLog,
    runtimeLog,
    runtimeWaitsForTermination,
    stateHome,
  },
) {
  const child = Bun.spawn(command, {
    cwd: checkoutPath,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl ?? process.env.DATABASE_URL,
      LIRNA_DOCKER_LOG: dockerLog,
      LIRNA_RUNTIME_LOG: runtimeLog,
      LIRNA_RUNTIME_WAITS_FOR_TERMINATION: runtimeWaitsForTermination
        ? "true"
        : "",
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

function startLifecycle(command, context) {
  const {
    checkoutPath,
    databaseUrl,
    dockerBin,
    dockerLog,
    runtimeLog,
    runtimeWaitsForTermination,
    stateHome,
  } = context;
  return Bun.spawn(command, {
    cwd: checkoutPath,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl ?? process.env.DATABASE_URL,
      LIRNA_DOCKER_LOG: dockerLog,
      LIRNA_RUNTIME_LOG: runtimeLog,
      LIRNA_RUNTIME_WAITS_FOR_TERMINATION: runtimeWaitsForTermination
        ? "true"
        : "",
      PATH: dockerBin ? `${dockerBin}:${process.env.PATH}` : process.env.PATH,
      XDG_STATE_HOME: stateHome,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

async function lifecycle(context, ...args) {
  return runLifecycle([process.execPath, lifecycleScript, ...args], context);
}

async function publicLifecycle(context, ...args) {
  await mkdir(join(context.checkoutPath, "scripts", "lifecycle"), {
    recursive: true,
  });
  await Promise.all([
    copyFile(
      lifecycleScript,
      join(context.checkoutPath, "scripts/lifecycle.ts"),
    ),
    ...[
      "checkout.ts",
      "database-command.ts",
      "environment.ts",
      "registry.ts",
      "service-command.ts",
    ].map((file) =>
      copyFile(
        join(import.meta.dir, "lifecycle", file),
        join(context.checkoutPath, "scripts", "lifecycle", file),
      ),
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

async function runtimeBun(context) {
  const dockerBin = join(context.checkoutPath, "bin");
  const runtimeLog = join(context.checkoutPath, "runtime.log");
  await mkdir(dockerBin);
  await writeFile(
    join(dockerBin, "bun"),
    `#!${process.execPath}
import { appendFile } from "node:fs/promises";

const runtime = {
  args: process.argv.slice(2),
  database:
    process.argv.includes("db:migrate") && process.env.DATABASE_URL
      ? (() => {
          const url = new URL(process.env.DATABASE_URL);
          return { host: url.host, name: url.pathname.slice(1) };
        })()
      : undefined,
  environment: {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    PORT: process.env.PORT,
    SERVER_URL: process.env.SERVER_URL,
    VITE_SERVER_URL: process.env.VITE_SERVER_URL,
  },
  pid:
    process.env.LIRNA_RUNTIME_WAITS_FOR_TERMINATION === "true"
      ? process.pid
      : undefined,
};
await appendFile(
  process.env.LIRNA_RUNTIME_LOG,
  JSON.stringify(runtime) + "\\n",
);
if (process.env.LIRNA_RUNTIME_WAITS_FOR_TERMINATION === "true")
  await new Promise(() => {});
`,
    { mode: 0o755 },
  );
  return { ...context, dockerBin, runtimeLog };
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

  const tools = Array.from({ length: 12 }, (_, index) => `tool-${index}`);
  const allocations = await Promise.all(
    tools.map((tool) =>
      lifecycle(primary, "allocate", first.checkoutPath, "--tool", tool),
    ),
  );
  expect(allocations.every(({ exitCode }) => exitCode === 0)).toBe(true);
  const registry = JSON.parse(
    await readFile(join(primary.stateHome, "lirna", "lifecycle.json"), "utf8"),
  );
  const stored = registry.environments.find(
    ({ checkoutPath }) => checkoutPath === first.checkoutPath,
  );
  const generated = JSON.parse(await readFile(configPath, "utf8"));
  expect(generated.ports).toEqual(stored.ports);
});

test("creates a managed task worktree with an allocated environment", async () => {
  const primary = await sandbox();
  expect((await lifecycle(primary, "register")).exitCode).toBe(0);
  await linkedWorktree(primary);

  const created = await lifecycle(primary, "create", "task-branch");
  const checkoutPath = join(primary.checkoutPath, ".worktrees", "task-branch");

  expect(created.exitCode).toBe(0);
  expect(created.stderr).toBe("");
  const environment = JSON.parse(created.stdout);
  const identity = environment.identity;
  expect(environment).toMatchObject({
    checkoutPath,
    databaseName: expect.stringMatching(/^lirna_[0-9a-f]{32}$/),
    identity: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ),
    ports: { server: expect.any(Number), tools: {}, web: expect.any(Number) },
  });
  const branch = Bun.spawn(
    ["git", "-C", primary.checkoutPath, "rev-parse", "--verify", "task-branch"],
    { stderr: "pipe" },
  );
  expect(await branch.exited).toBe(0);
  const ignored = Bun.spawn(
    ["git", "-C", primary.checkoutPath, "check-ignore", checkoutPath],
    { stderr: "pipe", stdout: "pipe" },
  );
  expect(await ignored.exited).toBe(0);
  expect(
    JSON.parse(
      await readFile(join(checkoutPath, ".lirna", "environment.json"), "utf8"),
    ),
  ).toEqual(environment);
  expect(await lifecycle({ ...primary, checkoutPath }, "diagnose")).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `${JSON.stringify(
      {
        actions: [],
        checkoutKind: "linked-worktree",
        checkoutPath,
        identity,
        issues: [],
        registrationState: "registered",
      },
      null,
      2,
    )}\n`,
  });
});

test("rolls back a managed worktree when configuration generation fails", async () => {
  const primary = await sandbox();
  expect((await lifecycle(primary, "register")).exitCode).toBe(0);
  await rm(join(primary.checkoutPath, ".lirna"), { recursive: true });
  await writeFile(join(primary.checkoutPath, ".lirna"), "blocks config\n");
  for (const args of [
    ["-C", primary.checkoutPath, "add", "--force", ".lirna"],
    ["-C", primary.checkoutPath, "commit", "--quiet", "-m", "block config"],
  ]) {
    const git = Bun.spawn(["git", ...args], { stderr: "pipe" });
    expect(await git.exited).toBe(0);
  }
  const checkoutPath = join(
    primary.checkoutPath,
    ".worktrees",
    "rollback-task",
  );

  const created = await lifecycle(primary, "create", "rollback-task");

  expect(created.exitCode).toBe(1);
  expect(created.stderr).not.toBe("");
  expect(existsSync(checkoutPath)).toBe(false);
  const branch = Bun.spawn(
    [
      "git",
      "-C",
      primary.checkoutPath,
      "show-ref",
      "--verify",
      "--quiet",
      "refs/heads/rollback-task",
    ],
    { stderr: "pipe" },
  );
  expect(await branch.exited).toBe(1);
  const registry = JSON.parse(
    await readFile(join(primary.stateHome, "lirna", "lifecycle.json"), "utf8"),
  );
  expect(
    registry.environments.some(
      (environment) => environment.checkoutPath === checkoutPath,
    ),
  ).toBe(false);
});

test("runs each managed service with its generated environment and allocated port", async () => {
  const primary = await runtimeBun(await sandbox());
  expect((await lifecycle(primary, "register")).exitCode).toBe(0);
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
  const firstEnvironment = JSON.parse(
    (
      await lifecycle(
        primary,
        "allocate",
        first.checkoutPath,
        "--tool",
        "studio",
      )
    ).stdout,
  );
  const secondEnvironment = JSON.parse(
    (
      await lifecycle(
        primary,
        "allocate",
        second.checkoutPath,
        "--tool",
        "studio",
      )
    ).stdout,
  );

  for (const context of [first, second]) {
    expect((await lifecycle(context, "run", "server")).exitCode).toBe(0);
    expect((await lifecycle(context, "run", "web")).exitCode).toBe(0);
    expect((await lifecycle(context, "run", "studio")).exitCode).toBe(0);
  }

  const expected = [firstEnvironment, secondEnvironment].flatMap(
    (environment) => {
      const serverUrl = environment.urls.server;
      const webUrl = environment.urls.web;
      const baseEnvironment = {
        BETTER_AUTH_URL: serverUrl,
        CORS_ORIGIN: webUrl,
        SERVER_URL: serverUrl,
        VITE_SERVER_URL: serverUrl,
      };
      return [
        {
          args: [
            "--cwd",
            join(environment.checkoutPath, "apps/server"),
            "--watch",
            "src/index.ts",
          ],
          environment: {
            ...baseEnvironment,
            PORT: String(environment.ports.server),
          },
        },
        {
          args: [
            "x",
            "vite",
            "apps/web",
            "--host",
            "127.0.0.1",
            "--port",
            String(environment.ports.web),
            "--strictPort",
          ],
          environment: {
            ...baseEnvironment,
            PORT: String(environment.ports.web),
          },
        },
        {
          args: [
            "run",
            "--cwd",
            "packages/db",
            "db:studio",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            String(environment.ports.tools.studio),
          ],
          environment: {
            ...baseEnvironment,
            PORT: String(environment.ports.tools.studio),
          },
        },
      ];
    },
  );
  expect(
    (await readFile(primary.runtimeLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual(expected);
});

test("allocates a Studio port before starting Studio from the public package command", async () => {
  const packageJson = JSON.parse(
    await readFile(join(import.meta.dir, "..", "package.json"), "utf8"),
  );

  expect(packageJson.scripts["db:studio"]).toBe(
    "bun run lifecycle allocate . --tool studio && bun run lifecycle run studio",
  );
});

test("migrates the managed database instead of an inherited database URL", async () => {
  const context = {
    ...(await runtimeBun(await sandbox())),
    databaseUrl: "postgresql://wrong:wrong@wrong.example/inherited_database",
  };
  const registration = await lifecycle(context, "register");
  expect(registration.exitCode).toBe(0);
  const identity = JSON.parse(registration.stdout).identity;

  const result = await lifecycle(context, "database", "migrate");

  expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
  expect(JSON.parse(await readFile(context.runtimeLog, "utf8"))).toEqual({
    args: ["run", "--cwd", "packages/db", "db:migrate"],
    database: {
      host: "127.0.0.1:5433",
      name: `lirna_${identity.replaceAll("-", "")}`,
    },
    environment: {},
  });
});

test("stops its service when the lifecycle command is terminated", async () => {
  const context = {
    ...(await runtimeBun(await sandbox())),
    runtimeWaitsForTermination: true,
  };
  expect((await lifecycle(context, "register")).exitCode).toBe(0);

  const lifecycleProcess = startLifecycle(
    [process.execPath, lifecycleScript, "run", "server"],
    context,
  );
  let runtime: { pid: number } | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      runtime = JSON.parse(await readFile(context.runtimeLog, "utf8"));
      break;
    } catch {
      await Bun.sleep(20);
    }
  }
  expect(runtime).toBeDefined();

  lifecycleProcess.kill();
  await Promise.race([
    lifecycleProcess.exited,
    Bun.sleep(1_000).then(() => {
      throw new Error("Lifecycle command did not stop after SIGTERM.");
    }),
  ]);
  await Bun.sleep(50);
  expect(() => process.kill(runtime?.pid ?? 0, 0)).toThrow();
});

test("rejects inherited object names as managed services", async () => {
  const context = await sandbox();

  expect(await lifecycle(context, "run", "constructor")).toEqual({
    exitCode: 1,
    stderr: "usage: bun run lifecycle run <server|web|studio>\n",
    stdout: "",
  });
});

test("refuses an existing task branch, path, or lifecycle registration", async () => {
  const primary = await sandbox();
  const registration = await lifecycle(primary, "register");
  await linkedWorktree(primary);
  const primaryEnvironment = JSON.parse(
    await readFile(join(primary.stateHome, "lirna", "lifecycle.json"), "utf8"),
  );
  const existingBranch = Bun.spawn(
    ["git", "-C", primary.checkoutPath, "branch", "already-exists"],
    { stderr: "pipe" },
  );
  expect(await existingBranch.exited).toBe(0);

  expect(await lifecycle(primary, "create", "already-exists")).toEqual({
    exitCode: 1,
    stderr: "The branch already-exists already exists.\n",
    stdout: "",
  });

  const existingPath = join(
    primary.checkoutPath,
    ".worktrees",
    "already-there",
  );
  await mkdir(existingPath, { recursive: true });
  expect(await lifecycle(primary, "create", "already-there")).toEqual({
    exitCode: 1,
    stderr: `A path already exists at ${existingPath}.\n`,
    stdout: "",
  });

  const registeredPath = join(
    primary.checkoutPath,
    ".worktrees",
    "already-registered",
  );
  primaryEnvironment.environments.push({
    checkoutPath: registeredPath,
    identity: "12345678-1234-4123-8123-123456789abc",
    ports: { server: 3002, tools: {}, web: 3003 },
  });
  await writeFile(
    join(primary.stateHome, "lirna", "lifecycle.json"),
    `${JSON.stringify(primaryEnvironment, null, 2)}\n`,
  );
  expect(await lifecycle(primary, "create", "already-registered")).toEqual({
    exitCode: 1,
    stderr: `A lifecycle environment is already registered at ${registeredPath}.\n`,
    stdout: "",
  });
  expect(JSON.parse(registration.stdout).identity).toBe(
    primaryEnvironment.primary.identity,
  );
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

test("supports database commands for a primary checkout with a version 1 registry", async () => {
  const context = await databaseDocker(await sandbox());
  const identity = "12345678-1234-4123-8123-123456789abc";
  await mkdir(join(context.stateHome, "lirna"), { recursive: true });
  await writeFile(
    join(context.stateHome, "lirna", "lifecycle.json"),
    `${JSON.stringify({
      primary: { checkoutPath: context.checkoutPath, identity },
      version: 1,
    })}\n`,
  );

  expect((await lifecycle(context, "database", "start")).exitCode).toBe(0);
  expect((await lifecycle(context, "database", "diagnose")).exitCode).toBe(0);
});

test("refuses database commands from an unregistered checkout", async () => {
  const registered = await databaseDocker(await sandbox());
  const other = await sandbox();
  other.stateHome = registered.stateHome;
  other.dockerBin = registered.dockerBin;
  other.dockerLog = registered.dockerLog;
  expect((await lifecycle(registered, "register")).exitCode).toBe(0);

  for (const command of ["start", "diagnose"]) {
    expect(await lifecycle(other, "database", command)).toEqual({
      exitCode: 1,
      stderr: "This checkout is not registered with the lifecycle registry.\n",
      stdout: "",
    });
  }
  expect(existsSync(registered.dockerLog)).toBe(false);
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

test("refuses an arbitrary provisioning target", async () => {
  const context = await sandbox();
  expect((await lifecycle(context, "register")).exitCode).toBe(0);

  const result = await lifecycle(
    context,
    "database",
    "provision",
    "someone_elses_database",
  );

  expect(result).toEqual({
    exitCode: 1,
    stderr:
      "usage: bun run lifecycle database <start|diagnose|migrate|provision>\n",
    stdout: "",
  });
});

test("refuses to provision an unmanaged linked worktree", async () => {
  const primary = await sandbox();
  expect((await lifecycle(primary, "register")).exitCode).toBe(0);
  const context = await linkedWorktree(primary);

  const result = await lifecycle(context, "database", "provision");

  expect(result).toEqual({
    exitCode: 1,
    stderr: "This checkout does not have a managed lifecycle environment.\n",
    stdout: "",
  });
});

test("refuses uncommitted migration history", async () => {
  const context = await sandbox();
  expect((await lifecycle(context, "register")).exitCode).toBe(0);
  const migrations = join(
    context.checkoutPath,
    "packages",
    "db",
    "src",
    "migrations",
  );
  await mkdir(migrations, { recursive: true });
  await writeFile(join(migrations, "uncommitted.sql"), "SELECT 1;\n");

  const result = await lifecycle(context, "database", "provision");

  expect(result).toEqual({
    exitCode: 1,
    stderr:
      "Commit or discard worktree migration changes before provisioning.\n",
    stdout: "",
  });
});
