import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApplicationDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import {
  OperationRepository,
  syntheticOperationKind,
} from "../../server/operations/operation-repository.js";
import { applicationOperations } from "../../server/operations/schema.js";
import { resetTestDatabase } from "./database-test-support.js";

describe("operation repository claims", () => {
  let database: ApplicationDatabase;
  let operations: OperationRepository;
  let stopDatabase: () => Promise<void>;

  beforeAll(async () => {
    let databaseUrl: string;
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = container.getConnectionUri();
      stopDatabase = () => container.stop().then(() => undefined);
    }

    await migrate(databaseUrl);
    database = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(database.db);
    operations = new OperationRepository(database.db);
  });

  afterAll(async () => {
    await database?.close();
    await stopDatabase?.();
  });

  it("gives concurrent claimers different queued operations", async () => {
    const first = await operations.submit(syntheticOperationKind, "first");
    const second = await operations.submit(syntheticOperationKind, "second");

    const claimed = await Promise.all([operations.claim(), operations.claim()]);

    expect(claimed.every(Boolean)).toBe(true);
    expect(new Set(claimed.map((operation) => operation?.id))).toEqual(
      new Set([first.id, second.id]),
    );
  });

  it("reclaims an operation after its processing lease expires", async () => {
    const submitted = await operations.submit(syntheticOperationKind, "expired");
    expect((await operations.claim())?.id).toBe(submitted.id);

    await database.db
      .update(applicationOperations)
      .set({ leaseUntil: new Date(Date.now() - 1_000) })
      .where(eq(applicationOperations.id, submitted.id));

    const reclaimed = await operations.claim();

    expect(reclaimed?.id).toBe(submitted.id);
    expect(reclaimed?.status).toBe("processing");
  });
});
