// biome-ignore lint/style/noExcessiveLinesPerFile: Registration, diagnosis, allocation, and worktree creation form one lifecycle workflow.
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  exec,
  inspectCheckout,
  inspectCheckoutDetails,
} from "./lifecycle/checkout";
import { databaseCommand } from "./lifecycle/database-command";
import { environmentReport, toolNamePattern } from "./lifecycle/environment";
import {
  addEnvironment,
  assertPrimaryOwnership,
  nextPort,
  readRegistry,
  registryPath,
  upgradeRegistry,
  withRegistryLock,
  writeEnvironmentConfig,
  writeRegistry,
} from "./lifecycle/registry";
import { runService } from "./lifecycle/service-command";

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
  const environment = registry?.environments?.find(
    (environment) => environment.checkoutPath === checkout.checkoutPath,
  );
  if (environment) {
    return {
      actions: [],
      ...checkout,
      identity: environment.identity,
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
  let registryFilePath: string | undefined;
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

async function register() {
  const checkout = await inspectCheckout();
  if (checkout.checkoutKind !== "primary") {
    throw new Error("Only the primary checkout can be registered.");
  }

  const registryFilePath = registryPath();
  const registry = await withRegistryLock(
    registryFilePath,
    async (existing) => {
      if (existing) assertPrimaryOwnership(existing, checkout.checkoutPath);
      const stored = existing ?? {
        environments: [],
        primary: {
          checkoutPath: checkout.checkoutPath,
          identity: randomUUID(),
        },
        version: 2,
      };
      const changed = existing ? upgradeRegistry(stored) : true;
      const environment =
        stored.environments.find(
          ({ checkoutPath }) => checkoutPath === checkout.checkoutPath,
        ) ??
        addEnvironment(stored, checkout.checkoutPath, stored.primary.identity);
      if (changed || !existing) await writeRegistry(registryFilePath, stored);
      await writeEnvironmentConfig(environment);
      return stored;
    },
  );
  process.stdout.write(
    `${JSON.stringify(registrationReport(checkout, registry.primary.identity), null, 2)}\n`,
  );
}

function allocationArguments(args: string[]) {
  let checkoutPath: string | undefined;
  const tools: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tool") {
      const tool = args[index + 1];
      if (!toolNamePattern.test(tool ?? "")) {
        throw new Error(
          "Tool names must start with a letter and contain only lowercase letters, numbers, and hyphens.",
        );
      }
      tools.push(tool);
      index += 1;
    } else if (!checkoutPath) {
      checkoutPath = argument;
    } else {
      throw new Error(
        "usage: bun run lifecycle allocate <checkout-path> [--tool <name>]...",
      );
    }
  }
  if (!checkoutPath) {
    throw new Error(
      "usage: bun run lifecycle allocate <checkout-path> [--tool <name>]...",
    );
  }
  return { checkoutPath, tools: [...new Set(tools)].sort() };
}

async function createArguments(args: string[]) {
  if (args.length !== 1) {
    throw new Error("usage: bun run lifecycle create <task-branch>");
  }
  const [branch] = args;
  if (branch.includes("/")) {
    throw new Error("Task branch names cannot contain path separators.");
  }
  try {
    await exec("git", ["check-ref-format", "--branch", branch]);
  } catch {
    throw new Error("Task branch name is not valid for Git.");
  }
  return branch;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function branchExists(checkoutPath, branch) {
  try {
    await exec("git", [
      "-C",
      checkoutPath,
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function create(args) {
  const branch = await createArguments(args);
  const caller = await inspectCheckoutDetails();
  if (caller.checkoutKind !== "primary") {
    throw new Error("Only the primary checkout can create managed worktrees.");
  }
  const checkoutPath = join(dirname(caller.checkoutPath), branch);
  const registryFilePath = registryPath();
  const environment = await withRegistryLock(
    registryFilePath,
    async (registry) => {
      assertPrimaryOwnership(registry, caller.checkoutPath);
      upgradeRegistry(registry);
      if (
        registry.environments.some(
          (environment) => environment.checkoutPath === checkoutPath,
        )
      ) {
        throw new Error(
          `A lifecycle environment is already registered at ${checkoutPath}.`,
        );
      }
      if (await pathExists(checkoutPath)) {
        throw new Error(`A path already exists at ${checkoutPath}.`);
      }
      if (await branchExists(caller.checkoutPath, branch)) {
        throw new Error(`The branch ${branch} already exists.`);
      }

      let worktreeCreated = false;
      try {
        await exec("git", [
          "-C",
          caller.checkoutPath,
          "worktree",
          "add",
          "--quiet",
          "-b",
          branch,
          checkoutPath,
        ]);
        worktreeCreated = true;
        const environment = addEnvironment(registry, checkoutPath);
        await writeEnvironmentConfig(environment);
        await writeRegistry(registryFilePath, registry);
        return environment;
      } catch (error) {
        if (!worktreeCreated) throw error;
        const cleanupFailures = [];
        await exec("git", [
          "-C",
          caller.checkoutPath,
          "worktree",
          "remove",
          "--force",
          checkoutPath,
        ]).catch(() => cleanupFailures.push("worktree"));
        await exec("git", [
          "-C",
          caller.checkoutPath,
          "branch",
          "-D",
          branch,
        ]).catch(() => cleanupFailures.push("branch"));
        if (cleanupFailures.length > 0) {
          throw new Error(
            `${error.message} Rollback could not remove the ${cleanupFailures.join(" and ")}.`,
          );
        }
        throw error;
      }
    },
  );
  process.stdout.write(
    `${JSON.stringify(environmentReport(environment), null, 2)}\n`,
  );
}

async function allocate(args) {
  const requested = allocationArguments(args);
  const [caller, target] = await Promise.all([
    inspectCheckoutDetails(),
    inspectCheckoutDetails(requested.checkoutPath),
  ]);
  if (caller.checkoutKind !== "primary") {
    throw new Error("Only the primary checkout can allocate environments.");
  }
  if (caller.commonPath !== target.commonPath) {
    throw new Error("The target is not a worktree of this primary checkout.");
  }

  const registryFilePath = registryPath();
  const environment = await withRegistryLock(
    registryFilePath,
    async (registry) => {
      assertPrimaryOwnership(registry, caller.checkoutPath);
      let changed = upgradeRegistry(registry);
      let stored = registry.environments.find(
        ({ checkoutPath }) => checkoutPath === target.checkoutPath,
      );
      if (!stored) {
        stored = addEnvironment(registry, target.checkoutPath);
        changed = true;
      }
      for (const tool of requested.tools) {
        if (stored.ports.tools[tool] === undefined) {
          stored.ports.tools[tool] = nextPort(registry);
          changed = true;
        }
      }
      if (changed) await writeRegistry(registryFilePath, registry);
      await writeEnvironmentConfig(stored);
      return stored;
    },
  );
  process.stdout.write(
    `${JSON.stringify(environmentReport(environment), null, 2)}\n`,
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "allocate") {
    await allocate(args);
    return;
  }
  if (command === "create") {
    await create(args);
    return;
  }
  if (command === "diagnose") {
    await diagnose();
    return;
  }
  if (command === "register") {
    await register();
    return;
  }
  if (command === "run") {
    await runService(args);
    return;
  }
  if (command === "database") {
    await databaseCommand(args);
    return;
  }
  throw new Error(
    "usage: bun run lifecycle <register|create|diagnose|allocate|run|database>",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
