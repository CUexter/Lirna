import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
} from "@lirna/db/schema/sources";
import { asc, eq } from "drizzle-orm";
import { readingIntegrationHtml } from "../sep-admission/fixtures/admission-preview";
import {
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "../sep-admission/fixtures/postgres";
import type { SepReadingContract } from "../sep-admission/reading/contract";
import { DrizzleActiveReadingDerivativeStore } from "../sep-admission/state/active-reading-derivative-store";
import { refreshDerivativeText } from "./derivative-test-fixture";
import { DrizzleDerivativeUpdateStore } from "./derivative-update-store";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;
let database: SepAdmissionPostgres["database"];
let admission: SepAdmissionPostgres["store"];
let updates: DrizzleDerivativeUpdateStore;
let activeReading: DrizzleActiveReadingDerivativeStore;
let cleanupDatabase: (() => Promise<void>) | undefined;

describePostgres("Reading Derivative updates in PostgreSQL", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("derivative-updates");
    database = opened.database;
    admission = opened.store;
    updates = new DrizzleDerivativeUpdateStore(database);
    activeReading = new DrizzleActiveReadingDerivativeStore(database);
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("generates from immutable hashes, activates transactionally, and rolls back append-only", async () => {
    const admittedAt = new Date("2026-08-25T00:00:00.000Z");
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:derivative-${previewId}`,
      title: "Derivative integration",
      observations: ["submitted"],
      bodies: { submitted: Buffer.from(readingIntegrationHtml, "utf8") },
      now: admittedAt,
    });
    const admitted = await admission.admit(
      previewId,
      ["submitted"],
      admittedAt,
    );
    const sourceId = admitted?.sourceId;
    const stateId = admitted?.states[0]?.id;
    if (!sourceId || !stateId) throw new Error("Admission failed");
    const initialState = await admission.getState(sourceId, stateId);
    if (!initialState) throw new Error("Initial state missing");
    const initialDerivative = initialState.derivatives[0];
    if (!initialDerivative) throw new Error("Initial derivative missing");
    const initialDerivativeId = initialDerivative.id;
    expect(initialDerivative.validation).toMatchObject({
      status: "valid",
      checks: expect.arrayContaining([
        expect.objectContaining({
          subject: "typed-structure",
          status: "passed",
        }),
        expect.objectContaining({
          subject: "diagnostics",
          status: "passed",
        }),
      ]),
    });
    const reading = await admission.getReading(sourceId, stateId);
    const component = reading?.components[0];
    if (!component) throw new Error("Reading component missing");
    const exactText = "typed paragraph";
    const start = component.plainText.indexOf(exactText);
    const annotationId = randomUUID();
    await database.insert(annotations).values({
      id: annotationId,
      sourceId,
      sourceStateId: stateId,
      componentIdentity: component.identity,
      kind: "highlight",
      publisherAnchor: null,
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: start,
      normalizedEndOffset: start + exactText.length,
      exactText,
      prefix: component.plainText.slice(Math.max(0, start - 32), start),
      suffix: component.plainText.slice(
        start + exactText.length,
        start + exactText.length + 32,
      ),
      color: "yellow",
    });
    const resourcesBefore = await resourceEvidence(stateId);
    await expect(
      activeReading.read({ sourceId, stateId }),
    ).resolves.toMatchObject({
      status: "active",
      value: {
        sourceId,
        stateId,
        derivativeId: initialDerivativeId,
        activationSequence: 1,
        policy: {
          rightsBasis: "publicly-accessible",
          sensitivityLevel: "ordinary-cloud",
        },
      },
    });

    const generated = await Promise.all([
      updates.generate({ sourceId, stateId }),
      updates.generate({ sourceId, stateId }),
    ]);
    const candidates = generated
      .filter((item) => item !== undefined)
      .toSorted(
        (left, right) => left.generation.version - right.generation.version,
      );
    expect(candidates.map(({ generation }) => generation.version)).toEqual([
      2, 3,
    ]);
    expect(
      candidates.map(({ previousDerivativeId }) => previousDerivativeId),
    ).toEqual([initialDerivativeId, initialDerivativeId]);
    const candidate = candidates[0];
    expect(candidate).toMatchObject({
      valid: true,
      generation: {
        version: 2,
        parser: { id: "parse5", version: "7.3.0" },
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: resourcesBefore,
      },
      comparison: {
        baselineDerivativeId: initialDerivativeId,
        relocations: [
          expect.objectContaining({
            recordType: "annotation",
            recordId: annotationId,
            classification: "exact",
          }),
        ],
      },
    });
    if (!candidate) throw new Error("Candidate missing");
    const candidatePreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: candidate.id,
    });
    if (candidatePreview.status !== "ready")
      throw new Error("Candidate preview missing");
    await expect(
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: candidate.id,
        actorId: "user-1",
        reason: "Reviewed upgrade",
        expectedBaselineSequence: candidatePreview.baselineSequence,
        expectedConsequences: candidatePreview.consequences,
      }),
    ).resolves.toMatchObject({
      status: "activated",
      activation: {
        derivativeId: candidate.id,
        sequence: 2,
        actorId: "user-1",
        reason: "Reviewed upgrade",
      },
    });
    const regeneratedState = await admission.getState(sourceId, stateId);
    if (!regeneratedState) throw new Error("Regenerated state missing");
    const persistedCandidate = regeneratedState.derivatives.find(
      ({ id }) => id === candidate.id,
    );
    if (!persistedCandidate) throw new Error("Persisted candidate missing");
    const regeneratedReading = await admission.getReading(sourceId, stateId);
    if (!regeneratedReading) throw new Error("Regenerated reading missing");
    expect({
      sourceStateId: regeneratedState.id,
      kind: persistedCandidate.kind,
      valid: persistedCandidate.valid,
      generation: {
        parser: persistedCandidate.generation.parser,
        renderer: persistedCandidate.generation.renderer,
        inputResourceHashes: persistedCandidate.generation.inputResourceHashes,
      },
      payload: regeneratedReading,
      validation: persistedCandidate.validation,
    }).toEqual({
      sourceStateId: initialState.id,
      kind: initialDerivative.kind,
      valid: initialDerivative.valid,
      generation: {
        parser: initialDerivative.generation.parser,
        renderer: initialDerivative.generation.renderer,
        inputResourceHashes: initialDerivative.generation.inputResourceHashes,
      },
      payload: reading,
      validation: initialDerivative.validation,
    });
    const rollbackPreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: initialDerivativeId,
    });
    if (rollbackPreview.status !== "ready")
      throw new Error("Rollback preview missing");
    await expect(
      activeReading.activate({
        sourceId,
        stateId,
        derivativeId: initialDerivativeId,
        actorId: "user-1",
        reason: "Explicit rollback",
        expectedBaselineSequence: rollbackPreview.baselineSequence,
        expectedConsequences: rollbackPreview.consequences,
      }),
    ).resolves.toMatchObject({
      status: "activated",
      activation: { derivativeId: initialDerivativeId, sequence: 3 },
    });

    const history = await database
      .select()
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId));
    expect(history).toHaveLength(3);
    expect(await resourceEvidence(stateId)).toEqual(resourcesBefore);
    expect(
      await database
        .select()
        .from(annotations)
        .where(eq(annotations.id, annotationId)),
    ).toEqual([
      expect.objectContaining({
        id: annotationId,
        sourceStateId: stateId,
        normalizedStartOffset: start,
        exactText,
      }),
    ]);

    const ambiguousId = randomUUID();
    const ambiguousReading = createAmbiguousReading(reading);
    await database.insert(sourceStateDerivatives).values({
      id: ambiguousId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      previousDerivativeId: initialDerivativeId,
      valid: true,
      generation: {
        version: 4,
        parser: { id: "parse5", version: "7.3.0" },
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: resourcesBefore,
      },
      payload: ambiguousReading,
      validation: { schema: "sep-reading-v1", status: "valid" },
    });
    const ambiguousPreview = await activeReading.previewActivation({
      sourceId,
      stateId,
      derivativeId: ambiguousId,
    });
    expect(
      ambiguousPreview.status === "ready"
        ? ambiguousPreview.consequences.relocations
        : [],
    ).toContainEqual(
      expect.objectContaining({
        recordId: annotationId,
        classification: "ambiguous",
      }),
    );
    if (ambiguousPreview.status !== "ready")
      throw new Error("Ambiguous activation preview missing");
    await activeReading.activate({
      sourceId,
      stateId,
      derivativeId: ambiguousId,
      actorId: "user-1",
      reason: "Reviewed ambiguous preservation",
      expectedBaselineSequence: ambiguousPreview.baselineSequence,
      expectedConsequences: ambiguousPreview.consequences,
    });
    expect(
      await database
        .select()
        .from(annotations)
        .where(eq(annotations.id, annotationId)),
    ).toEqual([
      expect.objectContaining({
        componentIdentity: component.identity,
        normalizedStartOffset: start,
        exactText,
      }),
    ]);
  });
});

function createAmbiguousReading(reading: SepReadingContract) {
  const ambiguousReading = structuredClone(reading);
  const component = ambiguousReading.components[0];
  if (!component) throw new Error("Reading component missing");
  const repeatedSection = component.sections[0];
  if (!repeatedSection) throw new Error("Reading section missing");
  component.introductoryBlocks = [
    {
      kind: "paragraph",
      children: [{ kind: "text", text: "Preface" }],
    },
  ];
  component.sections.push(structuredClone(repeatedSection));
  ambiguousReading.introductoryBlocks = component.introductoryBlocks;
  ambiguousReading.sections = component.sections;
  return refreshDerivativeText(ambiguousReading);
}

async function resourceEvidence(stateId: string) {
  return database
    .select({
      identity: sourceStateResources.identity,
      sha256: sourceStateResources.sha256,
    })
    .from(sourceStateResources)
    .where(eq(sourceStateResources.sourceStateId, stateId))
    .orderBy(asc(sourceStateResources.identity));
}
