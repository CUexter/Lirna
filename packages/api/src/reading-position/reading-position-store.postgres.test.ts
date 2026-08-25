import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

import { generationMetadata } from "../derivative-updates/derivative-test-fixture";
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
    reading.components.push({
      ...mainComponent,
      identity: "notes",
      role: "notes",
      label: "Publisher notes",
      order: 2,
      plainText: "Publisher note text.",
    });
    const [derivative] = await database
      .insert(sourceStateDerivatives)
      .values({
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: generationMetadata(),
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

  test("round trips semantic and legacy positions for every reading scene", async () => {
    const main = await store.save({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Spoofed label",
      scrollTop: 120,
      semanticLocation: location("active:/", "article", 120),
    });
    const supplement = await store.save({
      sourceId,
      stateId,
      componentIdentity: "supplement",
      componentLabel: "Another spoofed label",
      scrollTop: 480,
      semanticLocation: location("supplement", "article", 480),
    });
    const notes = await store.save({
      sourceId,
      stateId,
      componentIdentity: "notes",
      componentLabel: "Spoofed notes label",
      scrollTop: 320,
      semanticLocation: location("notes", "publisher-note", 320),
    });

    expect(main).toMatchObject({
      componentLabel: "Main entry",
      scrollTop: 120,
      semanticLocation: location("active:/", "article", 120),
    });
    expect(supplement).toMatchObject({
      componentLabel: "Supplement",
      scrollTop: 480,
      semanticLocation: location("supplement", "article", 480),
    });
    expect(notes).toMatchObject({
      componentLabel: "Publisher notes",
      scrollTop: 320,
      semanticLocation: location("notes", "publisher-note", 320),
    });
    await expect(
      store.get({ sourceId, stateId, componentIdentity: "active:/" }),
    ).resolves.toMatchObject({ scrollTop: 120 });
    await expect(
      store.get({ sourceId, stateId, componentIdentity: "supplement" }),
    ).resolves.toMatchObject({ scrollTop: 480 });
    await expect(
      store.get({ sourceId, stateId, componentIdentity: "notes" }),
    ).resolves.toMatchObject({
      scrollTop: 320,
      semanticLocation: location("notes", "publisher-note", 320),
    });
  });

  test("continues to accept legacy pixel-only records", async () => {
    await expect(
      store.save({
        sourceId,
        stateId,
        componentIdentity: "active:/",
        componentLabel: "Main entry",
        scrollTop: 90,
      }),
    ).resolves.toMatchObject({ scrollTop: 90 });
  });

  test("rejects an owner that does not belong to the persisted scene", async () => {
    await expect(
      store.save({
        sourceId,
        stateId,
        componentIdentity: "notes",
        componentLabel: "Publisher notes",
        scrollTop: 90,
        semanticLocation: location("notes", "article", 90),
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects semantic identity from another scene", async () => {
    await expect(
      store.save({
        sourceId,
        stateId,
        componentIdentity: "supplement",
        componentLabel: "Supplement",
        scrollTop: 90,
        semanticLocation: location("active:/", "article", 90),
      }),
    ).resolves.toBeUndefined();
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

function location(
  componentIdentity: string,
  owner: "article" | "publisher-note",
  scrollTop: number,
) {
  return {
    version: 1 as const,
    source: { sourceId, stateId },
    scene: { identity: componentIdentity, componentIdentity, owner },
    block: {
      identity: `content:${componentIdentity}`,
      strategy: "content-fingerprint" as const,
    },
    progress: 0.5,
    fallback: {
      scrollTop,
      blockIndex: 0,
      blockTag: "p",
      textExcerpt: "Publication text",
      authoredAnchor: null,
    },
  };
}
