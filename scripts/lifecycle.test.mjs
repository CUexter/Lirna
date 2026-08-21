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

const lifecycleScript = join(import.meta.dir, "lifecycle.mjs");
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
  return { checkoutPath, stateHome };
}

async function runLifecycle(command, { checkoutPath, stateHome }) {
  const child = Bun.spawn(command, {
    cwd: checkoutPath,
    env: { ...process.env, XDG_STATE_HOME: stateHome },
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
  await mkdir(join(context.checkoutPath, "scripts"));
  await Promise.all([
    copyFile(
      lifecycleScript,
      join(context.checkoutPath, "scripts/lifecycle.mjs"),
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
    primary: {
      checkoutPath: context.checkoutPath,
      identity: registration.identity,
    },
    version: 1,
  });
  expect(existsSync(join(context.checkoutPath, "lifecycle.json"))).toBe(false);
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
