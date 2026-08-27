// biome-ignore lint/style/noExcessiveLinesPerFile: This end-to-end proof keeps concurrent setup, request isolation, and cleanup in one auditable fixture.
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const postgresTest = adminUrl ? test : test.skip;
const repositoryRoot = resolve(import.meta.dir, "../..");
const reservationArguments = Array.from(
  { length: 20 },
  (_, index) => `isolation-reserve-${index}`,
).flatMap((tool) => ["--tool", tool]);

type Environment = {
  databaseName: string;
  identity: string;
  ports: { server: number; tools: Record<string, number>; web: number };
  urls: { server: string; tools: Record<string, string>; web: string };
};

type Server = {
  process: ReturnType<typeof Bun.spawn>;
  stderr: Promise<string>;
  stdout: Promise<string>;
};

async function run(command: string[], cwd: string, stateHome?: string) {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      POSTGRES_ADMIN_URL: adminUrl,
      XDG_STATE_HOME: stateHome ?? process.env.XDG_STATE_HOME,
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

async function lifecycle(cwd: string, stateHome: string, ...args: string[]) {
  return run(["bun", "scripts/lifecycle.ts", ...args], cwd, stateHome);
}

async function successfulLifecycle(
  cwd: string,
  stateHome: string,
  ...args: string[]
) {
  const result = await lifecycle(cwd, stateHome, ...args);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Environment;
}

async function installDependencies(checkoutPath: string) {
  const result = await run(
    ["bun", "install", "--frozen-lockfile"],
    checkoutPath,
  );
  expect(result.exitCode, result.stderr).toBe(0);
}

function startServer(checkoutPath: string): Server {
  const child = Bun.spawn(
    ["setsid", "bash", "-c", "exec bun scripts/lifecycle.ts run server"],
    {
      cwd: checkoutPath,
      env: {
        ...process.env,
        POSTGRES_ADMIN_URL: adminUrl,
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  return {
    process: child,
    stderr: new Response(child.stderr).text(),
    stdout: new Response(child.stdout).text(),
  };
}

async function assertPortIsAvailable(url: string) {
  const port = new URL(url).port;
  const result = await run(["fuser", `${port}/tcp`], repositoryRoot);
  expect(result.exitCode, result.stderr).toBe(1);
}

async function waitForServer(url: string, server: Server, expectedBody = "OK") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()) === expectedBody) return;
    } catch {}
    await Bun.sleep(100);
  }
  const exited = await Promise.race([
    server.process.exited.then(() => true),
    Bun.sleep(0).then(() => false),
  ]);
  throw new Error(
    exited
      ? `Server at ${url} exited before becoming ready.\n${await server.stderr}`
      : `Server at ${url} did not become ready.`,
  );
}

async function publicSources(url: string, origin: string) {
  const response = await fetch(`${url}/sources`, {
    headers: { origin },
  });
  const errorBody = response.ok ? "" : await response.text();
  expect(
    response.ok,
    `Source list at ${response.url} returned ${response.status}: ${errorBody}`,
  ).toBe(true);
  return response.json();
}

async function migrationCount(databaseName: string) {
  const client = new Client({ connectionString: databaseUrl(databaseName) });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations",
    );
    return result.rows[0]?.count;
  } finally {
    await client.end();
  }
}

async function committedMigrationCount(checkoutPath: string) {
  const journal = JSON.parse(
    await readFile(
      join(checkoutPath, "packages/db/src/migrations/meta/_journal.json"),
      "utf8",
    ),
  ) as { entries: unknown[] };
  return journal.entries.length;
}

function databaseUrl(databaseName: string) {
  const url = new URL(adminUrl ?? "");
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function cleanup({
  databaseNames,
  primaryPath,
  root,
  servers,
  worktreePaths,
}: {
  databaseNames: string[];
  primaryPath: string;
  root: string;
  servers: Server[];
  worktreePaths: string[];
}) {
  const errors: unknown[] = [];
  for (const server of servers) {
    try {
      const exited = await Promise.race([
        server.process.exited.then(() => true),
        Bun.sleep(0).then(() => false),
      ]);
      if (!exited) {
        // `setsid` makes this process and its lifecycle child a private group.
        process.kill(-server.process.pid, "SIGTERM");
        await Promise.race([
          server.process.exited,
          Bun.sleep(5_000).then(() => {
            throw new Error("Lifecycle server did not stop during cleanup.");
          }),
        ]);
      }
    } catch (error) {
      errors.push(error);
    }
    await Promise.all([server.stdout, server.stderr]);
  }

  if (databaseNames.length > 0) {
    const admin = new Client({ connectionString: adminUrl });
    try {
      await admin.connect();
      for (const name of databaseNames) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
    } catch (error) {
      errors.push(error);
    } finally {
      await admin.end().catch((error) => errors.push(error));
    }
  }

  for (const worktreePath of worktreePaths) {
    const result = await run(
      ["git", "-C", primaryPath, "worktree", "remove", "--force", worktreePath],
      primaryPath,
    );
    if (result.exitCode !== 0) errors.push(new Error(result.stderr));
  }
  await rm(root, { force: true, recursive: true }).catch((error) =>
    errors.push(error),
  );
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "Failed to clean up lifecycle isolation test resources",
    );
  }
}

postgresTest(
  "isolates concurrently created worktrees on one shared PostgreSQL service",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lirna-lifecycle-isolation-"));
    const primaryPath = join(root, "primary");
    const stateHome = join(root, "state");
    const firstBranch = `isolation-a-${randomUUID()}`;
    const secondBranch = `isolation-b-${randomUUID()}`;
    const firstPath = join(primaryPath, ".worktrees", firstBranch);
    const secondPath = join(primaryPath, ".worktrees", secondBranch);
    const databaseNames: string[] = [];
    const servers: Server[] = [];
    const worktreePaths: string[] = [];

    try {
      const clone = await run(
        ["git", "clone", "--quiet", "--shared", repositoryRoot, primaryPath],
        repositoryRoot,
      );
      expect(clone.exitCode, clone.stderr).toBe(0);
      await installDependencies(primaryPath);
      await successfulLifecycle(primaryPath, stateHome, "register");
      const reserved = await successfulLifecycle(
        primaryPath,
        stateHome,
        "allocate",
        primaryPath,
        ...reservationArguments,
      );

      const [first, second] = await Promise.all([
        successfulLifecycle(primaryPath, stateHome, "create", firstBranch),
        successfulLifecycle(primaryPath, stateHome, "create", secondBranch),
      ]);
      worktreePaths.push(firstPath, secondPath);
      databaseNames.push(first.databaseName, second.databaseName);
      expect(first.identity).not.toBe(second.identity);
      expect(first.databaseName).not.toBe(second.databaseName);
      expect(first.ports).not.toEqual(second.ports);
      expect(first.ports.server).not.toBe(second.ports.server);
      expect(first.ports.web).not.toBe(second.ports.web);
      const reservedToolPorts = Object.values(reserved.ports.tools);
      expect([
        ...new Set([
          ...reservedToolPorts,
          first.ports.server,
          first.ports.web,
          second.ports.server,
          second.ports.web,
        ]),
      ]).toHaveLength(reservedToolPorts.length + 4);

      await Promise.all([
        installDependencies(firstPath),
        installDependencies(secondPath),
      ]);
      const provisioned = await Promise.all([
        successfulLifecycle(firstPath, stateHome, "database", "provision"),
        successfulLifecycle(secondPath, stateHome, "database", "provision"),
      ]);
      expect(
        provisioned.map(({ databaseName }) => databaseName).sort(),
      ).toEqual(databaseNames.toSorted());
      const [firstMigrations, secondMigrations] = await Promise.all([
        migrationCount(first.databaseName),
        migrationCount(second.databaseName),
      ]);
      expect(firstMigrations).toBe(await committedMigrationCount(firstPath));
      expect(secondMigrations).toBe(await committedMigrationCount(secondPath));

      await Promise.all([
        assertPortIsAvailable(first.urls.server),
        assertPortIsAvailable(second.urls.server),
      ]);
      servers.push(startServer(firstPath));
      await waitForServer(first.urls.server, servers[0]);
      const firstServerEntry = join(firstPath, "apps/server/src/index.ts");
      const firstServerSource = await readFile(firstServerEntry, "utf8");
      await writeFile(
        firstServerEntry,
        firstServerSource.replace('c.text("OK")', 'c.text("HOT_RELOAD_OK")'),
      );
      await waitForServer(first.urls.server, servers[0], "HOT_RELOAD_OK");
      await Bun.sleep(1_000);
      servers.push(startServer(secondPath));
      await Promise.all([
        waitForServer(first.urls.server, servers[0], "HOT_RELOAD_OK"),
        waitForServer(second.urls.server, servers[1]),
      ]);
      const [firstSources, secondSources] = await Promise.all([
        publicSources(first.urls.server, first.urls.web),
        publicSources(second.urls.server, second.urls.web),
      ]);
      expect(firstSources).toEqual([]);
      expect(secondSources).toEqual([]);
    } finally {
      await cleanup({
        databaseNames,
        primaryPath,
        root,
        servers,
        worktreePaths,
      });
    }
  },
  120_000,
);
