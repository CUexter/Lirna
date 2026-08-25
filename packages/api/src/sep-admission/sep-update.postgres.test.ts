import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  sepAdmissionOutcomes,
  sepAdmissionPreviews,
} from "@lirna/db/schema/sep-admission";
import {
  sourceRelations,
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { eq } from "drizzle-orm";

import {
  hash,
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "./fixtures/postgres";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;
let database: SepAdmissionPostgres["database"];
let store: SepAdmissionPostgres["store"];
let cleanupDatabase: (() => Promise<void>) | undefined;

describePostgres("SEP Source updates", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("updates");
    database = opened.database;
    store = opened.store;
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("reuses unchanged state and appends only changed bytes", async () => {
    const stableKey = `sep:update-${randomUUID()}`;
    const firstPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
    });
    const first = await store.admit(firstPreviewId, ["submitted"], new Date());
    const originalStateId = first?.states[0]?.id;
    const unchangedPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
    });
    await database
      .update(sepAdmissionPreviews)
      .set({ replacesSourceId: first?.sourceId })
      .where(eq(sepAdmissionPreviews.id, unchangedPreviewId));
    const unchanged = await store.admit(
      unchangedPreviewId,
      ["submitted"],
      new Date(),
    );
    expect(unchanged?.outcomes).toEqual([
      {
        observationKey: "submitted",
        stateId: originalStateId,
        disposition: "unchanged",
      },
    ]);

    const changedBody = Buffer.from("genuinely changed publication bytes");
    const changedPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
      bodies: { submitted: changedBody },
    });
    await database
      .update(sepAdmissionPreviews)
      .set({ replacesSourceId: first?.sourceId })
      .where(eq(sepAdmissionPreviews.id, changedPreviewId));
    const changed = await store.admit(
      changedPreviewId,
      ["submitted"],
      new Date(),
    );
    expect(changed?.outcomes[0]).toMatchObject({ disposition: "created" });
    expect(changed?.states[0]?.id).not.toBe(originalStateId);
    expect(changed?.states[0]?.sequence).toBe(1);
    expect(
      await database
        .select({ id: sourceStates.id })
        .from(sourceStates)
        .where(eq(sourceStates.sourceId, first?.sourceId ?? "")),
    ).toHaveLength(2);
    const originalResources = await database
      .select({ sha256: sourceStateResources.sha256 })
      .from(sourceStateResources)
      .where(eq(sourceStateResources.sourceStateId, originalStateId ?? ""));
    expect(originalResources.map(({ sha256 }) => sha256)).not.toContain(
      hash(changedBody),
    );
  });

  test("relates a replacement without rewriting its legacy Source", async () => {
    const legacyId = randomUUID();
    await database.insert(sources).values({
      id: legacyId,
      title: "Legacy SEP text Source",
      admittedAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const previewId = await insertPreview(database, {
      stableKey: `sep:replacement-${randomUUID()}`,
      observations: ["submitted"],
    });
    await database
      .update(sepAdmissionPreviews)
      .set({ replacesSourceId: legacyId })
      .where(eq(sepAdmissionPreviews.id, previewId));

    const replacement = await store.admit(previewId, ["submitted"], new Date());
    expect(replacement?.sourceId).not.toBe(legacyId);
    expect(
      await database
        .select()
        .from(sourceRelations)
        .where(eq(sourceRelations.relatedSourceId, legacyId)),
    ).toMatchObject([
      {
        sourceId: replacement?.sourceId,
        relatedSourceId: legacyId,
        kind: "replacement-capture-for",
      },
    ]);
    expect(
      await database.select().from(sources).where(eq(sources.id, legacyId)),
    ).toMatchObject([
      { id: legacyId, title: "Legacy SEP text Source", stableKey: null },
    ]);
    expect(
      await database
        .select()
        .from(sepAdmissionOutcomes)
        .where(eq(sepAdmissionOutcomes.admissionPreviewId, previewId)),
    ).toHaveLength(1);
  });

  test("rejects a replacement relation to a first-class SEP Source", async () => {
    const firstClassId = randomUUID();
    await database.insert(sources).values({
      id: firstClassId,
      title: "First-class SEP Source",
      stableKey: `sep:first-class-${randomUUID()}`,
    });
    const previewId = await insertPreview(database, {
      stableKey: `sep:replacement-${randomUUID()}`,
      observations: ["submitted"],
    });
    await database
      .update(sepAdmissionPreviews)
      .set({ replacesSourceId: firstClassId })
      .where(eq(sepAdmissionPreviews.id, previewId));

    await expect(
      store.admit(previewId, ["submitted"], new Date()),
    ).rejects.toThrow("Replacement target must be a legacy SEP text Source");
    expect(
      await database
        .select()
        .from(sourceRelations)
        .where(eq(sourceRelations.relatedSourceId, firstClassId)),
    ).toHaveLength(0);
  });
});
