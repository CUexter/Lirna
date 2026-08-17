import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
  sources,
  user,
} from "./schema";
import { verifySepAdmissionPersistence } from "./test-support/sep-admission";

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
        "--verbose",
      ],
      {
        cwd: resolve(import.meta.dir, ".."),
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

  test("persists and cascades temporary SEP Admission evidence", async () => {
    await verifySepAdmissionPersistence(database);
  });

  test("retains exact Source-state evidence and activates only a valid matching Derivative", async () => {
    const sourceId = randomUUID();
    const stateId = randomUUID();
    const otherStateId = randomUUID();
    const derivativeId = randomUUID();
    const invalidDerivativeId = randomUUID();
    const body = Buffer.from("publisher-authored evidence", "utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");

    await database.insert(sources).values({
      id: sourceId,
      title: "Integration Source",
      stableKey: `sep:integration-${sourceId}`,
    });
    await database.insert(sourceStates).values([
      {
        id: stateId,
        sourceId,
        sequence: 0,
        adapterId: "sep",
        observationKey: "submitted",
        canonicalUrl: "https://plato.stanford.edu/entries/integration/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
      {
        id: otherStateId,
        sourceId,
        sequence: 1,
        adapterId: "sep",
        observationKey: "recommended-archive",
        canonicalUrl:
          "https://plato.stanford.edu/archives/spr2026/entries/integration/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
    ]);
    await database.insert(sourceStateResources).values({
      sourceStateId: stateId,
      identity: "active:/",
      role: "main",
      requestedUrl: "https://plato.stanford.edu/entries/integration/",
      finalUrl: "https://plato.stanford.edu/entries/integration/",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      retrievedAt: new Date(),
      selectedHeaders: { "content-type": "text/html; charset=utf-8" },
      requestCount: 1,
      downloadedBytes: body.byteLength,
      byteLength: body.byteLength,
      sha256,
      discoveryEdge: "submitted-entry",
      depth: 0,
      body,
    });
    await database.insert(sourceStateDerivatives).values([
      {
        id: derivativeId,
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        payload: { sourceStateId: stateId, derivativeId },
        validation: [],
      },
      {
        id: invalidDerivativeId,
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: false,
        payload: { sourceStateId: stateId, derivativeId: invalidDerivativeId },
        validation: ["invalid test fixture"],
      },
    ]);
    await database.insert(sourceStateDerivativeActivations).values({
      sourceStateId: stateId,
      derivativeId,
      kind: "sep-reading-v1",
    });

    const [retained] = await database
      .select({
        body: sourceStateResources.body,
        sha256: sourceStateResources.sha256,
      })
      .from(sourceStateResources)
      .where(eq(sourceStateResources.sourceStateId, stateId));
    expect(retained).toEqual({ body, sha256 });

    await expect(
      database
        .insert(sourceStateDerivatives)
        .values({
          sourceStateId: otherStateId,
          kind: "sep-reading-v1",
          previousDerivativeId: derivativeId,
          valid: true,
          payload: {},
          validation: [],
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivatives_previous_matches_check",
      },
    });
    await expect(
      database
        .insert(sourceStateDerivativeActivations)
        .values({
          sourceStateId: otherStateId,
          derivativeId,
          kind: "sep-reading-v1",
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivative_activations_matching_valid_check",
      },
    });
    await expect(
      database
        .insert(sourceStateDerivativeActivations)
        .values({
          sourceStateId: stateId,
          derivativeId: invalidDerivativeId,
          kind: "sep-reading-v1",
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivative_activations_matching_valid_check",
      },
    });
    await expect(
      database
        .update(sourceStates)
        .set({ sensitivityLevel: "local-only" })
        .where(eq(sourceStates.id, stateId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
  });
});
