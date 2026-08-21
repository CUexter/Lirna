#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const identityPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function registryPath() {
  const configuredStateHome = process.env.XDG_STATE_HOME;
  if (configuredStateHome && !isAbsolute(configuredStateHome)) {
    throw new Error("XDG_STATE_HOME must be an absolute path.");
  }
  const stateHome = configuredStateHome || join(homedir(), ".local", "state");
  return join(stateHome, "lirna", "lifecycle.json");
}

async function readRegistry(path) {
  try {
    const registry = JSON.parse(await readFile(path, "utf8"));
    if (
      registry?.version !== 1 ||
      !identityPattern.test(registry.primary?.identity) ||
      typeof registry.primary?.checkoutPath !== "string" ||
      !isAbsolute(registry.primary.checkoutPath)
    ) {
      throw new Error("unsupported lifecycle registry structure");
    }
    return registry;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function inspectCheckout(cwd = process.cwd()) {
  const [
    { stdout: root },
    { stdout: gitDirectory },
    { stdout: commonDirectory },
  ] = await Promise.all([
    exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]),
    exec("git", [
      "-C",
      cwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
    ]),
    exec("git", [
      "-C",
      cwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]),
  ]);
  const [checkoutPath, gitPath, commonPath] = await Promise.all([
    realpath(root.trim()),
    realpath(gitDirectory.trim()),
    realpath(commonDirectory.trim()),
  ]);
  return {
    checkoutKind: gitPath === commonPath ? "primary" : "linked-worktree",
    checkoutPath,
  };
}

function invalidDiagnosisReport(checkout, registryFilePath) {
  if (registryFilePath === undefined) {
    return {
      actions: [
        "Set XDG_STATE_HOME to an absolute path, then run `bun run lifecycle diagnose` again.",
      ],
      ...checkout,
      identity: null,
      issues: ["XDG_STATE_HOME must be an absolute path."],
      registrationState: "invalid",
    };
  }
  return {
    actions: [
      `Repair or remove the lifecycle registry at ${registryFilePath}, then run \`bun run lifecycle register\`.`,
    ],
    ...checkout,
    identity: null,
    issues: [
      "The lifecycle registry is unreadable or has an unsupported structure.",
    ],
    registrationState: "invalid",
  };
}

function diagnosisReport(checkout, registry) {
  if (registry?.primary.checkoutPath === checkout.checkoutPath) {
    return {
      actions: [],
      ...checkout,
      identity: registry.primary.identity,
      issues: [],
      registrationState: "registered",
    };
  }
  if (registry && checkout.checkoutKind === "primary") {
    return {
      actions: [
        `Use the registered primary checkout at ${registry.primary.checkoutPath}, or resolve its stale registration before continuing.`,
      ],
      ...checkout,
      identity: null,
      issues: [
        `The lifecycle registry belongs to a different primary checkout at ${registry.primary.checkoutPath}.`,
      ],
      registrationState: "conflict",
    };
  }
  if (checkout.checkoutKind === "primary") {
    return {
      actions: ["Run `bun run lifecycle register` from this checkout."],
      ...checkout,
      identity: null,
      issues: ["This primary checkout is not registered."],
      registrationState: "unregistered",
    };
  }
  let action =
    "Register the primary checkout before managing linked worktrees.";
  if (registry) {
    action = `Manage this linked worktree from the registered primary checkout at ${registry.primary.checkoutPath}.`;
  }
  return {
    actions: [action],
    ...checkout,
    identity: null,
    issues: ["This linked worktree is not registered."],
    registrationState: "unregistered",
  };
}

function writeDiagnosis(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.registrationState === "registered" ? 0 : 1;
}

async function diagnose() {
  const checkout = await inspectCheckout();
  let registryFilePath;
  try {
    registryFilePath = registryPath();
    writeDiagnosis(
      diagnosisReport(checkout, await readRegistry(registryFilePath)),
    );
  } catch {
    writeDiagnosis(invalidDiagnosisReport(checkout, registryFilePath));
  }
}

function registrationReport(checkout, identity) {
  return {
    ...checkout,
    identity,
    registrationState: "registered",
  };
}

function assertPrimaryOwnership(registry, checkoutPath) {
  if (registry?.primary.checkoutPath === checkoutPath) return;
  if (!registry) throw new Error("The lifecycle registry could not be read.");
  throw new Error(
    `A different primary checkout is already registered at ${registry.primary.checkoutPath}.`,
  );
}

async function register() {
  const checkout = await inspectCheckout();
  if (checkout.checkoutKind !== "primary") {
    throw new Error("Only the primary checkout can be registered.");
  }

  const registryFilePath = registryPath();
  const existing = await readRegistry(registryFilePath);
  if (existing) {
    assertPrimaryOwnership(existing, checkout.checkoutPath);
    process.stdout.write(
      `${JSON.stringify(registrationReport(checkout, existing.primary.identity), null, 2)}\n`,
    );
    return;
  }

  const registry = {
    primary: { checkoutPath: checkout.checkoutPath, identity: randomUUID() },
    version: 1,
  };
  await mkdir(dirname(registryFilePath), { mode: 0o700, recursive: true });
  const temporaryPath = `${registryFilePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporaryPath, registryFilePath);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  } finally {
    await unlink(temporaryPath);
  }

  const stored = await readRegistry(registryFilePath);
  assertPrimaryOwnership(stored, checkout.checkoutPath);
  process.stdout.write(
    `${JSON.stringify(registrationReport(checkout, stored.primary.identity), null, 2)}\n`,
  );
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "diagnose") {
    await diagnose();
    return;
  }
  if (command === "register") {
    await register();
    return;
  }
  throw new Error("usage: bun run lifecycle <register|diagnose>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
