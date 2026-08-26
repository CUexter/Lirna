import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

type Database = ReturnType<typeof import("../index")["createDb"]>;

export interface PostgresTestFixture {
  cleanup: () => Promise<void>;
  readonly database: Database;
  setup: () => Promise<void>;
}

export function createPostgresTestFixture(
  adminUrl: string | undefined,
): PostgresTestFixture {
  const databaseName = `lirna_integration_${process.pid}_${randomUUID().replaceAll("-", "")}`;
  let admin: Client | undefined;
  let database: Database | undefined;
  let defaultDatabase: typeof import("../index")["db"] | undefined;

  return {
    async cleanup() {
      const cleanupErrors: unknown[] = [];
      const cleanupSteps = [
        async () => database?.$client.end(),
        async () => defaultDatabase?.$client.end(),
        async () =>
          admin?.query(
            `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
          ),
        async () => admin?.end(),
      ];

      for (const cleanup of cleanupSteps) {
        try {
          await cleanup();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          "Failed to fully clean up the PostgreSQL integration database",
        );
      }
    },
    get database() {
      if (!database) throw new Error("PostgreSQL test fixture is not set up");
      return database;
    },
    async setup() {
      if (!adminUrl) return;

      const adminClient = new Client({ connectionString: adminUrl });
      await adminClient.connect();
      admin = adminClient;
      await admin.query(`CREATE DATABASE "${databaseName}"`);

      const databaseUrl = new URL(adminUrl);
      databaseUrl.pathname = `/${databaseName}`;
      configureTestEnvironment(databaseUrl.toString());
      await migrateDatabase(databaseUrl.toString());
      await verifySchemaDrift(databaseUrl.toString());

      const databaseModule = await import("../index");
      database = databaseModule.createDb();
      defaultDatabase = databaseModule.db;
    },
  };
}

export function generationMetadata() {
  return {
    version: 1,
    parser: { id: "parse5", version: "7.3.0" },
    renderer: { id: "lirna-reading-react", version: "1" },
    inputResourceHashes: [],
  };
}

function configureTestEnvironment(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";
}

async function migrateDatabase(databaseUrl: string) {
  const migrationPool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(import.meta.dir, "../migrations"),
    });
  } finally {
    await migrationPool.end();
  }
}

async function verifySchemaDrift(databaseUrl: string) {
  const driftCheck = Bun.spawn(
    [
      "bunx",
      "drizzle-kit",
      "push",
      "--dialect",
      "postgresql",
      "--schema",
      "./src/schema",
      "--url",
      databaseUrl,
      "--force",
      "--verbose",
    ],
    {
      cwd: resolve(import.meta.dir, "../.."),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [driftOutput, driftErrorOutput, driftExitCode] = await Promise.all([
    new Response(driftCheck.stdout).text(),
    new Response(driftCheck.stderr).text(),
    driftCheck.exited,
  ]);
  if (driftExitCode !== 0) {
    throw new Error(
      `Schema drift check failed with exit code ${driftExitCode}. Verify the disposable database connection and rerun; credentials are omitted.\n${driftOutput.trim()}\n${driftErrorOutput.trim()}`,
    );
  }
  if (!driftOutput.includes("No changes detected")) {
    throw new Error(
      `Migrated database differs from the TypeScript schema. Run 'bun run db:generate' and commit the migration.\n${driftOutput.trim()}\n${driftErrorOutput.trim()}`,
    );
  }
}
