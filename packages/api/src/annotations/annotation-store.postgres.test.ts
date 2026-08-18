import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_annotations_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = randomUUID();
const otherSourceId = randomUUID();
const stateId = randomUUID();

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./annotation-store")["DrizzleAnnotationStore"]
>;

describePostgres("Annotation PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    process.env.DATABASE_URL = testDatabase.databaseUrl;
    process.env.BETTER_AUTH_SECRET =
      "integration-only-secret-at-least-32-chars";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "test";

    const { DrizzleAnnotationStore } = await import("./annotation-store");
    store = new DrizzleAnnotationStore(database);
    await database.insert(sources).values([
      {
        id: sourceId,
        title: "Annotated Source",
        stableKey: `annotation:${sourceId}`,
      },
      {
        id: otherSourceId,
        title: "Other Source",
        stableKey: `annotation:${otherSourceId}`,
      },
    ]);
    await database.insert(sourceStates).values({
      id: stateId,
      sourceId,
      sequence: 0,
      adapterId: "test",
      rightsBasis: "owned",
      sensitivityLevel: "ordinary-cloud",
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("creates, scopes, updates, lists, and deletes annotations", async () => {
    expect(
      await store.create({
        sourceId: otherSourceId,
        stateId,
        componentIdentity: "article:main",
        startOffset: 2,
        endOffset: 10,
        exactText: "evidence",
        color: "yellow",
      }),
    ).toBeUndefined();

    const created = await store.create({
      sourceId,
      stateId,
      componentIdentity: "article:main",
      startOffset: 2,
      endOffset: 10,
      exactText: "evidence",
      color: "yellow",
      body: "  Initial note  ",
    });
    expect(created).toMatchObject({
      sourceStateId: stateId,
      exactText: "evidence",
      color: "yellow",
      body: "Initial note",
    });
    expect(await store.list(otherSourceId, stateId)).toEqual([]);
    expect(await store.list(sourceId, stateId)).toHaveLength(1);

    const preserved = await store.update({
      sourceId,
      stateId,
      id: created?.id ?? "",
      color: "green",
    });
    expect(preserved).toMatchObject({ color: "green", body: "Initial note" });

    const updated = await store.update({
      sourceId,
      stateId,
      id: created?.id ?? "",
      color: "blue",
      body: "   ",
    });
    expect(updated).toMatchObject({
      startOffset: 2,
      endOffset: 10,
      exactText: "evidence",
      color: "blue",
      body: null,
    });
    expect(
      await store.delete(otherSourceId, stateId, created?.id ?? ""),
    ).toBeFalse();
    expect(await store.delete(sourceId, stateId, created?.id ?? "")).toBeTrue();
    expect(await store.list(sourceId, stateId)).toEqual([]);
  });

  test("enforces annotation range and color constraints", async () => {
    await expect(
      database
        .insert(annotations)
        .values({
          sourceStateId: stateId,
          componentIdentity: "article:main",
          startOffset: 5,
          endOffset: 3,
          exactText: "invalid",
          color: "orange",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
