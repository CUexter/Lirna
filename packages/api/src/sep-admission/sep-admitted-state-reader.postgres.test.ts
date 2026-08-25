import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sepPreviewResources } from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { and, eq } from "drizzle-orm";

import { readingIntegrationHtml } from "./fixtures/admission-preview";
import {
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

describePostgres("SEP admitted-state PostgreSQL reader", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("reader");
    database = opened.database;
    store = opened.store;
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("returns a safe typed Reading for an admitted state", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    const mainBody = Buffer.from(readingIntegrationHtml, "utf8");
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:reading-${previewId}`,
      title: "Reading integration",
      observations: ["submitted"],
      bodies: { submitted: mainBody },
      citationBody: Buffer.from("citation evidence", "utf8"),
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const stateId = admitted?.states[0]?.id;
    expect(stateId).toBeDefined();

    const reading = await store.getReading(
      admitted?.sourceId ?? "",
      stateId ?? "",
    );
    expect(reading).toMatchObject({
      source: { title: "Reading integration" },
      sections: [
        {
          title: [{ kind: "text", text: "Knowledge" }],
          blocks: [
            {
              kind: "paragraph",
              children: [{ kind: "text", text: "A typed paragraph." }],
            },
          ],
        },
      ],
      provenance: {
        adapter: { id: "sep", version: "1" },
        parser: { id: "parse5", version: "7.3.0" },
      },
    });
    expect(JSON.stringify(reading)).not.toContain("window.pwned");
    const activations = await database
      .select({ derivativeId: sourceStateDerivativeActivations.derivativeId })
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId ?? ""));
    expect(activations).toHaveLength(1);
  });

  test("returns the admitted Source state", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:state-${previewId}`,
      title: "Reading integration",
      observations: ["submitted"],
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const state = admitted?.states[0];
    expect(state).toBeDefined();
    const reread = await store.getState(
      admitted?.sourceId ?? "",
      state?.id ?? "",
    );
    expect(reread).toEqual(state);
    expect(reread?.policy).toEqual({
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    });
    expect(reread?.resources[0]).toMatchObject({
      identity: expect.any(String),
      requestedUrl: expect.any(String),
      finalUrl: expect.any(String),
      retrievedAt: expect.any(String),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      byteLength: expect.any(Number),
      discoveryEdge: expect.any(String),
    });
    expect(reread?.derivatives[0]).toMatchObject({
      kind: "sep-reading-v1",
      currentActivation: { activatedAt: expect.any(String) },
      provenance: { adapter: { id: "sep", version: "1" } },
    });
    expect(
      await store.getState(admitted?.sourceId ?? "", randomUUID()),
    ).toBeUndefined();
  });

  test("uses the active observation as the update target", async () => {
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:update-target-${previewId}`,
      observations: ["submitted", "recommended-archive"],
    });
    const archiveUrl =
      "https://plato.stanford.edu/archives/sum2026/entries/reading/";
    await database
      .update(sepPreviewResources)
      .set({ requestedUrl: archiveUrl, finalUrl: archiveUrl })
      .where(
        and(
          eq(sepPreviewResources.previewId, previewId),
          eq(sepPreviewResources.observationKey, "recommended-archive"),
        ),
      );

    const admitted = await store.admit(
      previewId,
      ["submitted", "recommended-archive"],
      new Date(),
    );

    await expect(
      store.getUpdateTarget(admitted?.sourceId ?? ""),
    ).resolves.toEqual({
      stableKey: `sep:update-target-${previewId}`,
      canonicalUrl: "https://plato.stanford.edu/entries/reading/",
    });
  });

  test("keeps a legacy SEP text state listed and readable", async () => {
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:legacy-reading-${previewId}`,
      observations: ["submitted"],
    });
    const admitted = await store.admit(previewId, ["submitted"], new Date());
    const reading = await store.getReading(
      admitted?.sourceId ?? "",
      admitted?.states[0]?.id ?? "",
    );
    expect(reading).toBeDefined();
    if (!reading) throw new Error("Expected admitted Reading fixture");

    const legacySourceId = randomUUID();
    const legacyStateId = randomUUID();
    const legacyDerivativeId = randomUUID();
    await database.insert(sources).values({
      id: legacySourceId,
      title: "Legacy SEP text",
      stableKey: null,
    });
    await database.insert(sourceStates).values({
      id: legacyStateId,
      sourceId: legacySourceId,
      sequence: 0,
      adapterId: "sep-text-prototype",
      observationKey: null,
      canonicalUrl: null,
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    });
    await database.insert(sourceStateDerivatives).values({
      id: legacyDerivativeId,
      sourceStateId: legacyStateId,
      kind: "sep-reading-v1",
      valid: true,
      payload: {
        ...reading,
        source: {
          ...reading.source,
          id: legacySourceId,
          stateId: legacyStateId,
          title: "Legacy SEP text",
        },
      },
      validation: { schema: "sep-reading-v1", status: "valid" },
    });
    await database.insert(sourceStateDerivativeActivations).values({
      sourceStateId: legacyStateId,
      derivativeId: legacyDerivativeId,
      kind: "sep-reading-v1",
    });

    const legacy = (await store.listSources()).find(
      ({ id }) => id === legacySourceId,
    );
    expect(legacy).toMatchObject({
      kind: "legacy-sep-text",
      currentStateId: legacyStateId,
      states: [{ id: legacyStateId }],
    });
    await expect(
      store.getReading(legacySourceId, legacyStateId),
    ).resolves.toMatchObject({
      source: { id: legacySourceId, stateId: legacyStateId },
    });
  });

  test("deletes an admitted Source and its immutable state records", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:delete-${previewId}`,
      title: "Deletion integration",
      observations: ["submitted"],
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const sourceId = admitted?.sourceId;
    expect(sourceId).toBeDefined();

    await expect(
      database
        .delete(sourceStateDerivativeActivations)
        .where(
          eq(
            sourceStateDerivativeActivations.sourceStateId,
            admitted?.states[0]?.id ?? "",
          ),
        )
        .execute(),
    ).rejects.toHaveProperty(
      "cause.message",
      "source_state_derivative_activations records are immutable",
    );

    expect(await store.deleteSource(sourceId ?? "")).toBeTrue();
    expect(await store.listSources()).not.toContainEqual(
      expect.objectContaining({ id: sourceId }),
    );
    expect(await store.deleteSource(sourceId ?? "")).toBeFalse();
  });
});
