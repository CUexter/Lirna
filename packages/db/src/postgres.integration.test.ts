import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { user } from "./schema";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_integration_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let admin: Client | undefined;
let database: ReturnType<typeof import("./index")["createDb"]>;
let defaultDatabase: typeof import("./index")["db"];

async function cleanupPostgresResources() {
  const cleanupErrors: unknown[] = [];
  const cleanupSteps = [
    async () => database?.$client.end(),
    async () => defaultDatabase?.$client.end(),
    async () =>
      admin?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
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
}

describePostgres("PostgreSQL migrations and database repository", () => {
  beforeAll(async () => {
    if (!adminUrl) {
      return;
    }

    const adminClient = new Client({ connectionString: adminUrl });
    await adminClient.connect();
    admin = adminClient;
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.BETTER_AUTH_SECRET =
      "integration-only-secret-at-least-32-chars";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "test";

    const migrationPool = new Pool({
      connectionString: databaseUrl.toString(),
    });
    try {
      await migrate(drizzle(migrationPool), {
        migrationsFolder: resolve(import.meta.dir, "migrations"),
      });
    } finally {
      await migrationPool.end();
    }

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
        databaseUrl.toString(),
        "--force",
      ],
      {
        cwd: resolve(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    const [driftOutput, driftExitCode] = await Promise.all([
      new Response(driftCheck.stdout).text(),
      driftCheck.exited,
    ]);
    if (driftExitCode !== 0) {
      throw new Error(
        `Schema drift check failed with exit code ${driftExitCode}. Verify the disposable database connection and rerun; credentials are omitted.`,
      );
    }
    if (!driftOutput.includes("No changes detected")) {
      throw new Error(
        "Migrated database differs from the TypeScript schema. Run 'bun run db:generate' and commit the migration.",
      );
    }

    const databaseModule = await import("./index");
    database = databaseModule.createDb();
    defaultDatabase = databaseModule.db;
  }, 30_000);

  afterAll(cleanupPostgresResources);

  test("writes and reads a user through the exported database seam", async () => {
    await database.insert(user).values({
      id: "integration-user",
      name: "Integration User",
      email: "integration@example.test",
    });

    const rows = await database
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, "integration-user"));

    expect(rows).toEqual([
      { id: "integration-user", email: "integration@example.test" },
    ]);
  });

  test("surfaces the committed unique-email constraint", async () => {
    const duplicate = database.insert(user).values({
      id: "duplicate-user",
      name: "Duplicate User",
      email: "integration@example.test",
    });

    await expect(duplicate.execute()).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "user_email_unique",
      },
    });
  });
});
