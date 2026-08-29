import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

import { generationMetadata } from "../derivative-updates/derivative-test-fixture";
import { readingPayload } from "./annotation-store.postgres-test-support";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_annotations_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = randomUUID();
const otherSourceId = randomUUID();
const stateId = randomUUID();
const otherStateId = randomUUID();

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
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "test";

    const [
      { DrizzleAnnotationStore },
      { DrizzleActiveReadingDerivativeStore },
    ] = await Promise.all([
      import("./annotation-store"),
      import("../sep-admission/active-reading-derivative-store"),
    ]);
    store = new DrizzleAnnotationStore(
      database,
      new DrizzleActiveReadingDerivativeStore(database),
    );
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
    await database.insert(sourceStates).values([
      {
        id: stateId,
        sourceId,
        sequence: 0,
        adapterId: "test",
        rightsBasis: "owned",
        sensitivityLevel: "ordinary-cloud",
      },
      {
        id: otherStateId,
        sourceId: otherSourceId,
        sequence: 0,
        adapterId: "test",
        rightsBasis: "owned",
        sensitivityLevel: "ordinary-cloud",
      },
    ]);
    const [derivative] = await database
      .insert(sourceStateDerivatives)
      .values({
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: generationMetadata(),
        payload: readingPayload(sourceId, stateId),
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

  test("creates, scopes, updates, lists, and deletes annotations", async () => {
    expect(
      await store.create({
        ...createInput(),
        sourceId: otherSourceId,
      }),
    ).toBeUndefined();

    const created = await store.create({
      ...createInput(),
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
      id: created?.id ?? "",
      color: "green",
      kind: "note",
    });
    expect(preserved).toMatchObject({ color: "green", body: "Initial note" });

    const updated = await store.update({
      id: created?.id ?? "",
      color: "blue",
      kind: "highlight",
      body: "   ",
    });
    expect(updated).toMatchObject({
      normalizedStartOffset: 5,
      normalizedEndOffset: 13,
      exactText: "evidence",
      color: "blue",
      body: null,
    });
    expect(await store.delete(randomUUID())).toBeFalse();
    expect(await store.delete(created?.id ?? "")).toBeTrue();
    expect(await store.list(sourceId, stateId)).toEqual([]);
  });

  test("rejects fabricated, stale, publisher-mismatched, and cross-component anchors", async () => {
    const { InvalidAuthoredTargetError } = await import(
      "../authored-targets/authored-target"
    );
    const invalid = [
      createInput({ exactText: "fabricat" }),
      createInput({ prefix: "stale" }),
      createInput({ publisherAnchor: "missing-anchor" }),
      createInput({ publisherAnchor: "citation-mention-1" }),
      createInput({ componentIdentity: "article:supplement" }),
    ];

    for (const input of invalid) {
      await expect(store.create(input)).rejects.toBeInstanceOf(
        InvalidAuthoredTargetError,
      );
    }
    expect(await store.list(sourceId, stateId)).toEqual([]);
  });

  test("rejects an activation that points at another Source state's derivative", async () => {
    const mismatched = readingPayload(otherSourceId, otherStateId);
    const component = mismatched.components[0];
    if (!component) throw new Error("Reading fixture has no main component");
    component.plainText = "Wrong derivative text.";
    component.sections = [
      {
        id: "wrong",
        title: [{ kind: "text", text: "Wrong derivative text." }],
        level: 2,
        blocks: [],
        children: [],
      },
    ];
    mismatched.plainText = component.plainText;
    mismatched.sections = component.sections;
    const [derivative] = await database
      .insert(sourceStateDerivatives)
      .values({
        sourceStateId: otherStateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: generationMetadata(),
        payload: mismatched,
        validation: { schema: "sep-reading-v1", status: "valid" },
      })
      .returning({ id: sourceStateDerivatives.id });
    await expect(
      database
        .insert(sourceStateDerivativeActivations)
        .values({
          sourceStateId: stateId,
          derivativeId: derivative?.id ?? "",
          kind: "sep-reading-v1",
          activatedAt: new Date("2100-01-01T00:00:00.000Z"),
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  test("enforces annotation range and color constraints", async () => {
    await expect(
      database
        .insert(annotations)
        .values({
          sourceId,
          sourceStateId: stateId,
          componentIdentity: "article:main",
          kind: "highlight",
          publisherAnchor: null,
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 5,
          normalizedEndOffset: 3,
          exactText: "invalid",
          prefix: "",
          suffix: "",
          color: "orange",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  test("rejects contradictory Source and Source-state ownership", async () => {
    await expect(
      database
        .insert(annotations)
        .values({
          sourceId,
          sourceStateId: otherStateId,
          componentIdentity: "article:main",
          kind: "highlight",
          publisherAnchor: null,
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 0,
          normalizedEndOffset: 4,
          exactText: "Read",
          prefix: "",
          suffix: " evidence carefully.",
          color: "yellow",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

function createInput(
  overrides: Partial<Parameters<typeof store.create>[0]> = {},
): Parameters<typeof store.create>[0] {
  return {
    sourceId,
    stateId,
    componentIdentity: "article:main",
    kind: "note",
    publisherAnchor: "passage",
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 5,
    normalizedEndOffset: 13,
    exactText: "evidence",
    prefix: "Read ",
    suffix: " carefully.",
    color: "yellow",
    body: "Initial note",
    ...overrides,
  };
}
