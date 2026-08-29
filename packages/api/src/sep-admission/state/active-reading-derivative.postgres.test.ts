import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
} from "@lirna/db/schema/sources";
import { eq, sql } from "drizzle-orm";
import { DrizzleDerivativeUpdateStore } from "../../derivative-updates/derivative-update-store";
import {
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "../fixtures/postgres";
import { ActiveReadingDerivativeInvariantError } from "./active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "./active-reading-derivative-store";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;
let database: SepAdmissionPostgres["database"];
let admission: SepAdmissionPostgres["store"];
let updates: DrizzleDerivativeUpdateStore;
let activeReading: DrizzleActiveReadingDerivativeStore;
let cleanupDatabase: (() => Promise<void>) | undefined;

describePostgres("active Reading Derivative module in PostgreSQL", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("active-reading-derivative");
    database = opened.database;
    admission = opened.store;
    updates = new DrizzleDerivativeUpdateStore(database);
    activeReading = new DrizzleActiveReadingDerivativeStore(database);
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("keeps invalid candidates inactive", async () => {
    const { sourceId, stateId } = await admit("invalid");
    const invalidId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      id: invalidId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: false,
      generation: generation(2),
      payload: { version: 2 },
      validation: {
        status: "invalid",
        checks: [],
        comparison: emptyComparison(),
      },
    });

    await expect(
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: invalidId,
        actorId: "user-1",
        reason: "Must remain blocked",
        expectedBaselineSequence: 1,
        expectedConsequences: emptyComparison(),
      }),
    ).resolves.toEqual({ status: "candidate-invalid" });
    const invalidActivations = await database
      .select()
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.derivativeId, invalidId));
    expect(invalidActivations).toHaveLength(0);
  });

  test("treats a persisted canonical-text mismatch as an invalid candidate", async () => {
    const { sourceId, stateId } = await admit("canonical-text-mismatch");
    const payload = await admission.getReading(sourceId, stateId);
    const component = payload?.components[0];
    if (!payload || !component) throw new Error("Reading fixture missing");
    component.plainText = "Stale canonical text";
    const derivativeId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      id: derivativeId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: true,
      generation: generation(2),
      payload,
      validation: { schema: "sep-reading-v1", status: "valid" },
    });

    await expect(
      activeReading.previewActivation({ sourceId, stateId, derivativeId }),
    ).resolves.toEqual({ status: "candidate-invalid" });
  });

  test("rejects an Activation after its reviewed baseline becomes stale", async () => {
    const { sourceId, stateId } = await admit("stale");
    const first = await updates.generate({ sourceId, stateId });
    const second = await updates.generate({ sourceId, stateId });
    if (!first || !second) throw new Error("Candidates missing");
    const stalePreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: first.id,
    });
    const winningPreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: second.id,
    });
    if (stalePreview.status !== "ready" || winningPreview.status !== "ready")
      throw new Error("Activation preview missing");
    await activeReading.activate({
      sourceId,
      stateId,
      derivativeId: second.id,
      actorId: "user-1",
      reason: "Winning review",
      expectedBaselineSequence: winningPreview.baselineSequence,
      expectedConsequences: winningPreview.consequences,
    });
    await expect(
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: first.id,
        actorId: "user-1",
        reason: "Stale review",
        expectedBaselineSequence: stalePreview.baselineSequence,
        expectedConsequences: stalePreview.consequences,
      }),
    ).resolves.toEqual({ status: "stale-review" });
  });

  test("rejects an Activation when authored records change after review", async () => {
    const { sourceId, stateId } = await admit("stale-authored-records");
    const candidate = await updates.generate({ sourceId, stateId });
    const reading = await admission.getReading(sourceId, stateId);
    const component = reading?.components[0];
    if (!candidate || !component)
      throw new Error("Candidate or reading missing");
    const preview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: candidate.id,
    });
    if (preview.status !== "ready")
      throw new Error("Activation preview missing");
    await database.insert(annotations).values({
      sourceId,
      sourceStateId: stateId,
      componentIdentity: component.identity,
      kind: "note",
      publisherAnchor: null,
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 0,
      normalizedEndOffset: 1,
      exactText: component.plainText.slice(0, 1),
      prefix: "",
      suffix: component.plainText.slice(1, 33),
      color: "yellow",
    });

    await expect(
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: candidate.id,
        actorId: "user-1",
        reason: "Authored records changed",
        expectedBaselineSequence: preview.baselineSequence,
        expectedConsequences: preview.consequences,
      }),
    ).resolves.toEqual({ status: "stale-review" });
    const history = await database
      .select()
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId));
    expect(history).toHaveLength(1);
  });

  test("lets one concurrent Activation win and rejects the other review", async () => {
    const { sourceId, stateId } = await admit("concurrent");
    const first = await updates.generate({ sourceId, stateId });
    const second = await updates.generate({ sourceId, stateId });
    if (!first || !second) throw new Error("Candidates missing");
    const firstPreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: first.id,
    });
    const secondPreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: second.id,
    });
    if (firstPreview.status !== "ready" || secondPreview.status !== "ready")
      throw new Error("Activation preview missing");

    const results = await Promise.all([
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: first.id,
        actorId: "user-1",
        reason: "First concurrent review",
        expectedBaselineSequence: firstPreview.baselineSequence,
        expectedConsequences: firstPreview.consequences,
      }),
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: second.id,
        actorId: "user-1",
        reason: "Second concurrent review",
        expectedBaselineSequence: secondPreview.baselineSequence,
        expectedConsequences: secondPreview.consequences,
      }),
    ]);

    expect(results.map(({ status }) => status).toSorted()).toEqual([
      "activated",
      "stale-review",
    ]);
  });

  test("reports a corrupt active Reading Derivative payload", async () => {
    const { sourceId, stateId } = await admit("corrupt");
    const derivativeId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      id: derivativeId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: true,
      generation: generation(2),
      payload: { corrupt: true },
      validation: { schema: "sep-reading-v1", status: "valid" },
    });
    await insertUncheckedActivation(stateId, derivativeId);

    await expect(activeReading.read({ sourceId, stateId })).rejects.toThrow();
  });

  test("does not fall back past an invalid newest Activation", async () => {
    const { sourceId, stateId } = await admit("invalid-activation");
    const derivativeId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      id: derivativeId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: false,
      generation: generation(2),
      payload: { version: 2 },
      validation: {
        status: "invalid",
        checks: [],
        comparison: emptyComparison(),
      },
    });
    await insertUncheckedActivation(stateId, derivativeId);

    await expect(
      activeReading.read({ sourceId, stateId }),
    ).rejects.toBeInstanceOf(ActiveReadingDerivativeInvariantError);
  });
});

async function admit(label: string) {
  const previewId = randomUUID();
  await insertPreview(database, {
    id: previewId,
    stableKey: `sep:${label}-${previewId}`,
    title: `${label} active Reading Derivative integration`,
    observations: ["submitted"],
  });
  const admitted = await admission.admit(previewId, ["submitted"], new Date());
  const sourceId = admitted?.sourceId;
  const stateId = admitted?.states[0]?.id;
  if (!sourceId || !stateId) throw new Error("Admission failed");
  return { sourceId, stateId };
}

function generation(version: number) {
  return {
    version,
    parser: { id: "parse5", version: "7.3.0" },
    renderer: { id: "lirna-reading-react", version: "1" },
    inputResourceHashes: [],
  };
}

function emptyComparison() {
  return {
    semantic: { changedComponents: [] },
    structure: [],
    diagnostics: { added: [], removed: [] },
    relocations: [],
  };
}

async function insertUncheckedActivation(
  stateId: string,
  derivativeId: string,
) {
  const trigger = '"source_state_derivative_activations_validate"';
  await database.execute(
    sql.raw(
      `ALTER TABLE "source_state_derivative_activations" DISABLE TRIGGER ${trigger}`,
    ),
  );
  try {
    await database.insert(sourceStateDerivativeActivations).values({
      sourceStateId: stateId,
      derivativeId,
      kind: "sep-reading-v1",
      sequence: 2,
    });
  } finally {
    await database.execute(
      sql.raw(
        `ALTER TABLE "source_state_derivative_activations" ENABLE TRIGGER ${trigger}`,
      ),
    );
  }
}
