import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { exec, inspectCheckoutDetails } from "./checkout";
import {
  databaseEndpoint,
  databaseName,
  postgresAdminUrl,
} from "./environment";
import { readRegistry, registryPath } from "./registry";

async function databaseContext(
  unregisteredMessage = "This checkout is not registered with the lifecycle registry.",
) {
  const [registry, checkout] = await Promise.all([
    readRegistry(registryPath()),
    inspectCheckoutDetails(),
  ]);
  if (!registry) {
    throw new Error(
      "Register the primary checkout before managing the shared development PostgreSQL service.",
    );
  }
  const environment =
    registry.version === 1 &&
    registry.primary.checkoutPath === checkout.checkoutPath
      ? registry.primary
      : registry.environments?.find(
          ({ checkoutPath }) => checkoutPath === checkout.checkoutPath,
        );
  if (!environment) {
    throw new Error(unregisteredMessage);
  }
  return { environment, registry };
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
  const { registry } = await databaseContext();
  writeDatabaseDiagnosis(await databaseReport(registry));
}

async function startDatabase() {
  const { registry } = await databaseContext();
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

async function migrateDatabase() {
  const { environment } = await databaseContext(
    "This checkout does not have a managed lifecycle environment.",
  );
  const databaseUrl = postgresAdminUrl();
  databaseUrl.pathname = `/${databaseName(environment.identity)}`;
  const child = Bun.spawn(
    ["bun", "run", "--cwd", "packages/db", "db:migrate"],
    {
      cwd: environment.checkoutPath,
      env: migrationEnvironment(databaseUrl.toString()),
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    },
  );
  process.exitCode = await child.exited;
}

function migrationEnvironment(databaseUrl: string) {
  const environment = { ...process.env, DATABASE_URL: databaseUrl };
  for (const name of ["CORS_ORIGIN", "PORT", "SERVER_URL", "VITE_SERVER_URL"]) {
    delete environment[name];
  }
  return environment;
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
  const { environment } = await databaseContext(
    "This checkout does not have a managed lifecycle environment.",
  );
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

export async function databaseCommand(args: string[]) {
  if (
    args.length !== 1 ||
    !["diagnose", "migrate", "provision", "start"].includes(args[0])
  ) {
    throw new Error(
      "usage: bun run lifecycle database <start|diagnose|migrate|provision>",
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
  if (args[0] === "migrate") {
    await migrateDatabase();
    return;
  }
  await diagnoseDatabase();
}
