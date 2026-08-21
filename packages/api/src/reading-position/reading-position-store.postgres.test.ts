import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

import {
  readingFixture,
  sourceId,
  stateId,
} from "../orpc/routers/sep-admission.test-fixtures";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_positions_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./reading-position-store")["DrizzleReadingPositionStore"]
>;

describePostgres("Reading position PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    const { DrizzleReadingPositionStore } = await import(
      "./reading-position-store"
    );
    store = new DrizzleReadingPositionStore(database);

    await database.insert(sources).values({
      id: sourceId,
      title: "Test entry",
      stableKey: `position:${sourceId}`,
    });
    await database.insert(sourceStates).values({
      id: stateId,
      sourceId,
      sequence: 0,
      adapterId: "test",
      rightsBasis: "owned",
      sensitivityLevel: "ordinary-cloud",
    });
    const reading = readingFixture();
    const mainComponent = reading.components[0];
    if (!mainComponent)
      throw new Error("Reading fixture has no main component");
    reading.components.push({
      ...mainComponent,
      identity: "supplement",
      role: "supplement",
      label: "Supplement",
      order: 1,
      plainText: "Supplement text.",
    });
    const [derivative] = await database
      .insert(sourceStateDerivatives)
      .values({
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        payload: reading,
        validation: { schema: "sep-reading-v1", status: "valid" },
      })
      .returning({ id: sourceStateDerivatives.id });
    await database.insert(sourceStateDerivativeActivations).values({
      sourceStateId: stateId,
      derivativeId: derivative?.id ?? "",
      kind: "sep-reading-v1",
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("persists independent positions per Source component", async () => {
    const main = await store.save({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Spoofed label",
      scrollTop: 120,
    });
    const supplement = await store.save({
      sourceId,
      stateId,
      componentIdentity: "supplement",
      componentLabel: "Another spoofed label",
      scrollTop: 480,
    });

    expect(main).toMatchObject({
      componentLabel: "Main entry",
      scrollTop: 120,
    });
    expect(supplement).toMatchObject({
      componentLabel: "Supplement",
      scrollTop: 480,
    });
    await expect(
      store.get({ sourceId, stateId, componentIdentity: "active:/" }),
    ).resolves.toMatchObject({ scrollTop: 120 });
    await expect(
      store.get({ sourceId, stateId, componentIdentity: "supplement" }),
    ).resolves.toMatchObject({ scrollTop: 480 });
  });

  test("rejects a position for a component outside the active derivative", async () => {
    await expect(
      store.save({
        sourceId,
        stateId,
        componentIdentity: "missing",
        componentLabel: "Missing",
        scrollTop: 10,
      }),
    ).resolves.toBeUndefined();
  });
});
