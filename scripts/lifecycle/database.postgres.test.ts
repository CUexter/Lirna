import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { provisionManagedDatabase } from "./database";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const postgresTest = adminUrl ? test : test.skip;
const repositoryRoot = resolve(import.meta.dir, "../..");
const lifecycleScript = join(repositoryRoot, "scripts", "lifecycle.ts");
const dbPackage = join(repositoryRoot, "packages", "db");

async function run(command: string[], cwd: string, stateHome: string) {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      POSTGRES_ADMIN_URL: adminUrl,
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

async function lifecycle(cwd: string, stateHome: string, ...args: string[]) {
  return run(["bun", lifecycleScript, ...args], cwd, stateHome);
}

async function git(cwd: string, ...args: string[]) {
  const result = await run(["git", ...args], cwd, join(cwd, ".state"));
  expect(result.exitCode, result.stderr).toBe(0);
}

function databaseUrl(name: string) {
  const url = new URL(adminUrl ?? "");
  url.pathname = `/${name}`;
  return url.toString();
}

postgresTest(
  "provisions only the managed database and converges on committed migrations",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lirna-provision-test-"));
    const primary = join(root, "primary");
    const first = join(root, "first");
    const second = join(root, "second");
    const stateHome = join(root, "state");
    const marker = `marker_${randomUUID().replaceAll("-", "")}`;
    let firstDatabase: string | undefined;
    let secondDatabase: string | undefined;
    let adminConnected = false;
    const admin = new Client({ connectionString: adminUrl });

    try {
      await Promise.all([
        mkdir(join(primary, "packages", "db"), { recursive: true }),
        mkdir(join(primary, "scripts", "lifecycle"), { recursive: true }),
      ]);
      await Promise.all([
        cp(
          join(dbPackage, "src", "migrations"),
          join(primary, "packages", "db", "src", "migrations"),
          { recursive: true },
        ),
        cp(
          join(repositoryRoot, "scripts", "lifecycle", "database.ts"),
          join(primary, "scripts", "lifecycle", "database.ts"),
        ),
        cp(
          join(repositoryRoot, "scripts", "lifecycle", "package.json"),
          join(primary, "scripts", "lifecycle", "package.json"),
        ),
        cp(join(repositoryRoot, "package.json"), join(primary, "package.json")),
        symlink(
          join(repositoryRoot, "node_modules"),
          join(primary, "node_modules"),
        ),
      ]);
      await git(root, "init", "--quiet", primary);
      await git(primary, "config", "user.email", "test@example.com");
      await git(primary, "config", "user.name", "Lifecycle Test");
      await git(primary, "add", ".");
      await git(primary, "commit", "--quiet", "-m", "fixture");
      await git(primary, "worktree", "add", "--quiet", "--detach", first);
      await git(primary, "worktree", "add", "--quiet", "--detach", second);

      expect((await lifecycle(primary, stateHome, "register")).exitCode).toBe(
        0,
      );
      const firstEnvironment = JSON.parse(
        (await lifecycle(primary, stateHome, "allocate", first)).stdout,
      );
      const secondEnvironment = JSON.parse(
        (await lifecycle(primary, stateHome, "allocate", second)).stdout,
      );
      firstDatabase = firstEnvironment.databaseName;
      secondDatabase = secondEnvironment.databaseName;
      if (!firstDatabase || !secondDatabase) {
        throw new Error("Lifecycle allocation did not return database names.");
      }

      await admin.connect();
      adminConnected = true;
      await admin.query(`CREATE DATABASE "${secondDatabase}"`);
      await admin.query(`CREATE SCHEMA "${marker}"`);
      await admin.query(`CREATE TABLE "${marker}".evidence (value text)`);
      await admin.query(`INSERT INTO "${marker}".evidence VALUES ('admin')`);
      const sibling = new Client({
        connectionString: databaseUrl(secondDatabase),
      });
      await sibling.connect();
      await sibling.query(`CREATE SCHEMA "${marker}"`);
      await sibling.query(`CREATE TABLE "${marker}".evidence (value text)`);
      await sibling.query(
        `INSERT INTO "${marker}".evidence VALUES ('sibling')`,
      );
      await sibling.end();

      const [firstProvision, concurrentProvision] = await Promise.all([
        lifecycle(first, stateHome, "database", "provision"),
        lifecycle(first, stateHome, "database", "provision"),
      ]);
      const repeatedProvision = await lifecycle(
        first,
        stateHome,
        "database",
        "provision",
      );

      expect(firstProvision).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: `${JSON.stringify(
          { databaseName: firstDatabase, migrationState: "current" },
          null,
          2,
        )}\n`,
      });
      expect(concurrentProvision).toEqual(firstProvision);
      expect(repeatedProvision).toEqual(firstProvision);
      const journal = JSON.parse(
        await readFile(
          join(dbPackage, "src", "migrations", "meta", "_journal.json"),
          "utf8",
        ),
      );
      const target = new Client({
        connectionString: databaseUrl(firstDatabase),
      });
      await target.connect();
      const migrationCount = await target.query(
        "SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations",
      );
      expect(migrationCount.rows[0].count).toBe(journal.entries.length);
      await target.end();

      const unchangedSibling = new Client({
        connectionString: databaseUrl(secondDatabase),
      });
      await unchangedSibling.connect();
      expect(
        (await unchangedSibling.query(`SELECT value FROM "${marker}".evidence`))
          .rows,
      ).toEqual([{ value: "sibling" }]);
      expect(
        (
          await unchangedSibling.query(
            "SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations",
          )
        ).rows,
      ).toEqual([{ migrations: null }]);
      await unchangedSibling.end();
      expect(
        (await admin.query(`SELECT value FROM "${marker}".evidence`)).rows,
      ).toEqual([{ value: "admin" }]);
      expect(
        (
          await admin.query(
            "SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations",
          )
        ).rows,
      ).toEqual([{ migrations: null }]);
    } finally {
      if (adminConnected && firstDatabase) {
        await admin
          .query(`DROP DATABASE IF EXISTS "${firstDatabase}" WITH (FORCE)`)
          .catch(() => {});
      }
      if (adminConnected && secondDatabase) {
        await admin
          .query(`DROP DATABASE IF EXISTS "${secondDatabase}" WITH (FORCE)`)
          .catch(() => {});
      }
      if (adminConnected) {
        await admin
          .query(`DROP SCHEMA IF EXISTS "${marker}" CASCADE`)
          .catch(() => {});
      }
      await admin.end().catch(() => {});
      await rm(root, { force: true, recursive: true });
    }
  },
  30_000,
);

postgresTest(
  "removes a newly created database when its migration fails",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lirna-failed-migration-test-"));
    const migrations = join(root, "migrations");
    const identity = randomUUID();
    const database = `lirna_${identity.replaceAll("-", "")}`;
    const admin = new Client({ connectionString: adminUrl });

    try {
      await cp(join(dbPackage, "src", "migrations"), migrations, {
        recursive: true,
      });
      const migrationFiles = (await readdir(migrations))
        .filter((file) => file.endsWith(".sql"))
        .sort();
      const lastMigration = migrationFiles.at(-1);
      if (!lastMigration) throw new Error("Migration fixture is empty.");
      await appendFile(
        join(migrations, lastMigration),
        "\nTHIS IS NOT VALID SQL;\n",
      );

      await expect(
        provisionManagedDatabase({
          adminUrl: adminUrl ?? "",
          identity,
          migrationsFolder: migrations,
        }),
      ).rejects.toThrow();

      await admin.connect();
      expect(
        (
          await admin.query(
            "SELECT count(*)::integer AS count FROM pg_database WHERE datname = $1",
            [database],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await admin.end().catch(() => {});
      await rm(root, { force: true, recursive: true });
    }
  },
  30_000,
);
