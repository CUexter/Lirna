import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import { sepAdmissionPreviews } from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { eq } from "drizzle-orm";

import {
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "../sep-admission/fixtures/postgres";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;

let database: SepAdmissionPostgres["database"];
let admission: SepAdmissionPostgres["store"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let createOfflineWorkingSetCapture: typeof import("./offline-working-set-capture")["createOfflineWorkingSetCapture"];

describePostgres("Offline working-set PostgreSQL capture", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("offline-working-set");
    database = opened.database;
    admission = opened.store;
    cleanupDatabase = opened.cleanup;
    ({ createOfflineWorkingSetCapture } = await import(
      "./offline-working-set-capture"
    ));
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("captures reading and authored state from one observation during concurrent writes", async () => {
    const { sourceId, stateId } = await admitSource("consistent");
    const initial = await createOfflineWorkingSetCapture(database).capture(
      sourceId,
      stateId,
    );
    if (initial.status !== "captured") {
      throw new Error("Initial Offline working-set capture is unavailable");
    }
    const component = initial.snapshot.replica.workspace.reading.components[0];
    const active = initial.snapshot.manifest.activeDerivative;
    const initialActivation =
      initial.snapshot.replica.workspace.state.derivatives.find(
        ({ id }) => id === active.id,
      )?.currentActivation;
    if (!(component && initialActivation)) {
      throw new Error("Active Reading Derivative fixture is incomplete");
    }

    const annotationId = randomUUID();
    await database.insert(annotations).values({
      id: annotationId,
      sourceId,
      sourceStateId: stateId,
      componentIdentity: component.identity,
      kind: "highlight",
      publisherAnchor: null,
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 0,
      normalizedEndOffset: 1,
      exactText: component.plainText.slice(0, 1),
      prefix: "",
      suffix: component.plainText.slice(1, 33),
      color: "yellow",
    });
    await database.insert(readingPositions).values({
      sourceStateId: stateId,
      componentIdentity: component.identity,
      componentLabel: component.label,
      scrollTop: 10,
      savedAt: new Date("2026-08-29T00:00:00.000Z"),
    });

    const [stored] = await database
      .select()
      .from(sourceStateDerivatives)
      .where(eq(sourceStateDerivatives.id, active.id));
    if (!stored) throw new Error("Initial Reading Derivative is missing");
    const nextDerivativeId = randomUUID();
    const nextReading = structuredClone(
      initial.snapshot.replica.workspace.reading,
    );
    nextReading.source.title = "Concurrent Reading revision";
    await database.insert(sourceStateDerivatives).values({
      ...stored,
      id: nextDerivativeId,
      previousDerivativeId: active.id,
      generation: { ...(stored.generation as object), version: 2 },
      payload: nextReading,
    });

    const resolutionId = randomUUID();
    const capture = createOfflineWorkingSetCapture(database, async () => {
      await database.insert(sourceStateDerivativeActivations).values({
        sourceStateId: stateId,
        derivativeId: nextDerivativeId,
        kind: "sep-reading-v1",
        sequence: initialActivation.sequence + 1,
        actorId: "user-1",
        reason: "Concurrent reviewed activation",
        consequences: initialActivation.consequences,
      });
      await database
        .update(annotations)
        .set({ color: "green", updatedAt: new Date() })
        .where(eq(annotations.id, annotationId));
      await database
        .update(readingPositions)
        .set({ scrollTop: 20, savedAt: new Date() })
        .where(eq(readingPositions.sourceStateId, stateId));
      await database.insert(citationResolutions).values({
        id: resolutionId,
        sourceStateId: stateId,
        derivativeId: nextDerivativeId,
        componentIdentity: component.identity,
        mentionId: "post-snapshot-resolution",
        bibliographyComponentIdentity: component.identity,
        bibliographyEntryId: "post-snapshot-entry",
        publisherAnchor: null,
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 0,
        normalizedEndOffset: 1,
        exactText: component.plainText.slice(0, 1),
        prefix: "",
        suffix: component.plainText.slice(1, 33),
        actorId: "user-1",
        action: "selected",
        method: "manual",
      });
    });

    const during = await capture.capture(sourceId, stateId);
    if (during.status !== "captured") {
      throw new Error("Concurrent Offline working-set capture is unavailable");
    }
    expect(during.snapshot.manifest.activeDerivative.id).toBe(active.id);
    expect(during.snapshot.replica.workspace.reading.source.title).toBe(
      initial.snapshot.replica.workspace.reading.source.title,
    );
    expect(during.snapshot.replica.workspace.citationResolutions).toEqual([]);
    expect(during.snapshot.replica.annotations).toMatchObject([
      { id: annotationId, color: "yellow" },
    ]);
    expect(during.snapshot.replica.positions).toMatchObject([
      { scrollTop: 10 },
    ]);

    const after = await createOfflineWorkingSetCapture(database).capture(
      sourceId,
      stateId,
    );
    if (after.status !== "captured") {
      throw new Error("Updated Offline working-set capture is unavailable");
    }
    expect(after.snapshot.manifest.activeDerivative.id).toBe(nextDerivativeId);
    expect(after.snapshot.replica.workspace.reading.source.title).toBe(
      "Concurrent Reading revision",
    );
    expect(after.snapshot.replica.workspace.citationResolutions).toMatchObject([
      { id: resolutionId, derivativeId: nextDerivativeId },
    ]);
    expect(after.snapshot.replica.annotations).toMatchObject([
      { id: annotationId, color: "green" },
    ]);
    expect(after.snapshot.replica.positions).toMatchObject([{ scrollTop: 20 }]);
  });

  test("refuses capture when Source handling policy forbids retention", async () => {
    const { sourceId, stateId } = await admitSource("policy", "reference-only");

    await expect(
      createOfflineWorkingSetCapture(database).capture(sourceId, stateId),
    ).resolves.toEqual({
      status: "policy-ineligible",
      reasons: ["rights-reference-only"],
    });
  });
});

async function admitSource(
  label: string,
  rightsBasis: "publicly-accessible" | "reference-only" = "publicly-accessible",
) {
  const previewId = randomUUID();
  await insertPreview(database, {
    id: previewId,
    stableKey: `sep:offline-${label}-${previewId}`,
    observations: ["submitted"],
  });
  await database
    .update(sepAdmissionPreviews)
    .set({ rightsBasis })
    .where(eq(sepAdmissionPreviews.id, previewId));
  let admitted: Awaited<ReturnType<typeof admission.admit>>;
  try {
    admitted = await admission.admit(previewId, ["submitted"], new Date());
  } catch (error) {
    if (
      !(error instanceof ReferenceError && error.message.includes("reader"))
    ) {
      throw error;
    }
  }
  const sourceId = admitted?.sourceId;
  const stateId = admitted?.states[0]?.id;
  if (sourceId && stateId) return { sourceId, stateId };

  // Admission committed before the baseline store's projection-read failure.
  const [committedSource] = await database
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.stableKey, `sep:offline-${label}-${previewId}`));
  const [committedState] = committedSource
    ? await database
        .select({ id: sourceStates.id })
        .from(sourceStates)
        .where(eq(sourceStates.sourceId, committedSource.id))
    : [];
  if (!(committedSource && committedState)) {
    throw new Error("Admission fixture is missing");
  }
  return { sourceId: committedSource.id, stateId: committedState.id };
}
