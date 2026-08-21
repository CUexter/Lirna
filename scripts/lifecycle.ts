// biome-ignore lint/style/noExcessiveLinesPerFile: The lifecycle CLI keeps its persisted registry contract and command mutations in one executable boundary.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const identityPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const toolNamePattern = /^[a-z][a-z0-9-]*$/;
const databaseNamePattern = /^lirna_[0-9a-f]{32}$/;
const databaseEndpoint = "127.0.0.1:5433";

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
      ![1, 2].includes(registry?.version) ||
      !identityPattern.test(registry.primary?.identity) ||
      typeof registry.primary?.checkoutPath !== "string" ||
      !isAbsolute(registry.primary.checkoutPath) ||
      (registry.version === 2 && !validEnvironments(registry))
    ) {
      throw new Error("unsupported lifecycle registry structure");
    }
    return registry;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function environmentPorts(environment) {
  const tools = environment?.ports?.tools;
  if (
    !identityPattern.test(environment?.identity) ||
    typeof environment.checkoutPath !== "string" ||
    !isAbsolute(environment.checkoutPath) ||
    !Number.isInteger(environment.ports?.server) ||
    !Number.isInteger(environment.ports?.web) ||
    !tools ||
    Array.isArray(tools) ||
    Object.keys(tools).some((name) => !toolNamePattern.test(name))
  ) {
    return null;
  }
  const ports = [
    environment.ports.server,
    environment.ports.web,
    ...Object.values(tools),
  ];
  if (
    ports.some(
      (port) => !Number.isInteger(port) || port < 1024 || port > 65_535,
    ) ||
    new Set(ports).size !== ports.length
  ) {
    return null;
  }
  return ports;
}

function validEnvironments(registry) {
  if (!Array.isArray(registry.environments)) return false;
  const identities = new Set();
  const paths = new Set();
  const ports = new Set();
  for (const environment of registry.environments) {
    const allocatedPorts = environmentPorts(environment);
    if (
      !allocatedPorts ||
      identities.has(environment.identity) ||
      paths.has(environment.checkoutPath) ||
      allocatedPorts.some((port) => ports.has(port))
    ) {
      return false;
    }
    identities.add(environment.identity);
    paths.add(environment.checkoutPath);
    for (const port of allocatedPorts) ports.add(port);
  }
  return registry.environments.some(
    (environment) =>
      environment.identity === registry.primary.identity &&
      environment.checkoutPath === registry.primary.checkoutPath,
  );
}

async function inspectCheckoutDetails(cwd = process.cwd()) {
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
    commonPath,
  };
}

async function inspectCheckout(cwd = process.cwd()) {
  const { checkoutKind, checkoutPath } = await inspectCheckoutDetails(cwd);
  return { checkoutKind, checkoutPath };
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

function assertPrimaryOwnership(registry, checkoutPath) {
  if (registry?.primary.checkoutPath === checkoutPath) return;
  if (!registry) throw new Error("The lifecycle registry could not be read.");
  throw new Error(
    `A different primary checkout is already registered at ${registry.primary.checkoutPath}.`,
  );
}

function nextPort(registry) {
  const usedPorts = new Set(
    registry.environments.flatMap(({ ports }) => [
      ports.server,
      ports.web,
      ...Object.values(ports.tools),
    ]),
  );
  for (let port = 3000; port <= 65_535; port += 1) {
    if (!usedPorts.has(port)) return port;
  }
  throw new Error("No lifecycle ports remain available.");
}

function addEnvironment(registry, checkoutPath, identity = randomUUID()) {
  const environment = {
    checkoutPath,
    identity,
    ports: { server: nextPort(registry), tools: {}, web: 0 },
  };
  registry.environments.push(environment);
  environment.ports.web = nextPort(registry);
  return environment;
}

function upgradeRegistry(registry) {
  if (registry.version === 2) return false;
  registry.environments = [];
  registry.version = 2;
  addEnvironment(
    registry,
    registry.primary.checkoutPath,
    registry.primary.identity,
  );
  return true;
}

async function writeRegistry(path, registry) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

async function withRegistryLock(path, mutate) {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const lockPath = `${path}.lock`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || attempt === 499) {
        throw new Error(`The lifecycle registry is locked at ${lockPath}.`);
      }
      await delay(10);
    }
  }
  try {
    return await mutate(await readRegistry(path));
  } finally {
    await rmdir(lockPath);
  }
}

function environmentReport(environment) {
  const toolUrls = Object.fromEntries(
    Object.entries(environment.ports.tools).map(([name, port]) => [
      name,
      `http://127.0.0.1:${port}`,
    ]),
  );
  return {
    checkoutPath: environment.checkoutPath,
    databaseName: databaseName(environment.identity),
    identity: environment.identity,
    ports: environment.ports,
    urls: {
      server: `http://127.0.0.1:${environment.ports.server}`,
      tools: toolUrls,
      web: `http://127.0.0.1:${environment.ports.web}`,
    },
    version: 1,
  };
}

function databaseName(identity: string) {
  const name = `lirna_${identity.replaceAll("-", "")}`;
  if (!identityPattern.test(identity) || !databaseNamePattern.test(name)) {
    throw new Error("The managed lifecycle identity cannot name a database.");
  }
  return name;
}

async function writeEnvironmentConfig(environment) {
  const path = join(environment.checkoutPath, ".lirna", "environment.json");
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(environmentReport(environment), null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  try {
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

async function register() {
  const checkout = await inspectCheckout();
  if (checkout.checkoutKind !== "primary") {
    throw new Error("Only the primary checkout can be registered.");
  }

  const registryFilePath = registryPath();
  const { environment, registry } = await withRegistryLock(
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
      return { environment, registry: stored };
    },
  );
  await writeEnvironmentConfig(environment);
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
      return stored;
    },
  );
  await writeEnvironmentConfig(environment);
  process.stdout.write(
    `${JSON.stringify(environmentReport(environment), null, 2)}\n`,
  );
}

async function databaseRegistry() {
  const registry = await readRegistry(registryPath());
  if (!registry) {
    throw new Error(
      "Register the primary checkout before managing the shared development PostgreSQL service.",
    );
  }
  return registry;
}

function composeArguments(primaryCheckoutPath, args) {
  return [
    "compose",
    "--project-directory",
    primaryCheckoutPath,
    "--file",
    join(primaryCheckoutPath, "docker-compose.yml"),
    ...args,
  ];
}

async function databaseReport(registry) {
  let service: { Health?: string; State?: string } | undefined;
  try {
    const { stdout } = await exec(
      "docker",
      composeArguments(registry.primary.checkoutPath, [
        "ps",
        "--format",
        "json",
        "postgres",
      ]),
    );
    service = JSON.parse(stdout.trim());
  } catch {}
  return {
    endpoint: databaseEndpoint,
    primaryCheckoutPath: registry.primary.checkoutPath,
    serviceState:
      service?.State === "running" && service.Health === "healthy"
        ? "reachable"
        : "unreachable",
  };
}

function writeDatabaseDiagnosis(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.serviceState === "reachable" ? 0 : 1;
}

async function diagnoseDatabase() {
  writeDatabaseDiagnosis(await databaseReport(await databaseRegistry()));
}

async function startDatabase() {
  const registry = await databaseRegistry();
  try {
    await exec(
      "docker",
      composeArguments(registry.primary.checkoutPath, [
        "up",
        "--detach",
        "--wait",
        "postgres",
      ]),
    );
  } catch {
    throw new Error(
      "Unable to start the shared development PostgreSQL service.",
    );
  }
  writeDatabaseDiagnosis(await databaseReport(registry));
}

function postgresAdminUrl() {
  const configured = process.env.POSTGRES_ADMIN_URL;
  try {
    const url = configured
      ? new URL(configured)
      : new URL(
          `postgresql://postgres:${encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "password")}@${databaseEndpoint}/postgres`,
        );
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    ) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error("POSTGRES_ADMIN_URL must be a valid PostgreSQL URL.");
  }
}

async function committedMigrations(checkoutPath: string) {
  const root = await mkdtemp(join(tmpdir(), "lirna-migrations-"));
  const archive = join(root, "migrations.tar");
  try {
    await exec("git", [
      "-C",
      checkoutPath,
      "archive",
      "--format=tar",
      `--output=${archive}`,
      "HEAD",
      "--",
      "packages/db/src/migrations",
    ]);
    await exec("tar", ["-xf", archive, "-C", root]);
    return {
      dispose: () => rm(root, { force: true, recursive: true }),
      path: join(root, "packages", "db", "src", "migrations"),
    };
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

async function provisionDatabase() {
  const registry = await databaseRegistry();
  const checkout = await inspectCheckoutDetails();
  const environment = registry.environments.find(
    ({ checkoutPath }) => checkoutPath === checkout.checkoutPath,
  );
  if (!environment) {
    throw new Error(
      "This checkout does not have a managed lifecycle environment.",
    );
  }
  const name = databaseName(environment.identity);
  const adminUrl = postgresAdminUrl();
  const { stdout: migrationChanges } = await exec("git", [
    "-C",
    environment.checkoutPath,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "packages/db/src/migrations",
  ]);
  if (migrationChanges.trim()) {
    throw new Error(
      "Commit or discard worktree migration changes before provisioning.",
    );
  }

  const migrations = await committedMigrations(environment.checkoutPath);
  try {
    const provisionerPath = join(
      environment.checkoutPath,
      "scripts",
      "lifecycle",
      "database.ts",
    );
    const { provisionManagedDatabase } = await import(
      pathToFileURL(provisionerPath).href
    );
    const provisionedName = await provisionManagedDatabase({
      adminUrl: adminUrl.toString(),
      identity: environment.identity,
      migrationsFolder: migrations.path,
    });
    if (provisionedName !== name) {
      throw new Error(
        "The provisioned database does not match the managed identity.",
      );
    }
  } catch {
    throw new Error("Unable to provision the managed worktree database.");
  } finally {
    await migrations.dispose();
  }

  process.stdout.write(
    `${JSON.stringify({ databaseName: name, migrationState: "current" }, null, 2)}\n`,
  );
}

async function database(args: string[]) {
  if (
    args.length !== 1 ||
    !["diagnose", "provision", "start"].includes(args[0])
  ) {
    throw new Error(
      "usage: bun run lifecycle database <start|diagnose|provision>",
    );
  }
  if (args[0] === "start") {
    await startDatabase();
    return;
  }
  if (args[0] === "provision") {
    await provisionDatabase();
    return;
  }
  await diagnoseDatabase();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "allocate") {
    await allocate(args);
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
  if (command === "database") {
    await database(args);
    return;
  }
  throw new Error(
    "usage: bun run lifecycle <register|diagnose|allocate|database>",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
