import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { annotations } from "@lirna/db/schema/annotations";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
} from "@lirna/db/schema/sources";
import { asc, eq } from "drizzle-orm";
import {
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "../sep-admission/fixtures/postgres";
import { DrizzleDerivativeUpdateStore } from "./derivative-update-store";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;
let database: SepAdmissionPostgres["database"];
let admission: SepAdmissionPostgres["store"];
let updates: DrizzleDerivativeUpdateStore;
let cleanupDatabase: (() => Promise<void>) | undefined;

describePostgres("Reading Derivative updates in PostgreSQL", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("derivative-updates");
    database = opened.database;
    admission = opened.store;
    updates = new DrizzleDerivativeUpdateStore(database);
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
    const initialDerivativeId = initialState?.derivatives[0]?.id;
    if (!initialDerivativeId) throw new Error("Initial derivative missing");
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
    await expect(
      updates.activate({
        sourceId,
        stateId,
        derivativeId: candidate.id,
        actorId: "user-1",
        reason: "Reviewed upgrade",
        expectedConsequences: candidate.comparison,
      }),
    ).resolves.toMatchObject({
      derivativeId: candidate.id,
      actorId: "user-1",
      reason: "Reviewed upgrade",
    });
    const rollbackConsequences = await updates.previewActivation({
      sourceId,
      stateId,
      derivativeId: initialDerivativeId,
    });
    if (!rollbackConsequences) throw new Error("Rollback preview missing");
    await expect(
      updates.activate({
        sourceId,
        stateId,
        derivativeId: initialDerivativeId,
        actorId: "user-1",
        reason: "Explicit rollback",
        expectedConsequences: rollbackConsequences,
      }),
    ).resolves.toMatchObject({ derivativeId: initialDerivativeId });

    const history = await database
      .select()
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId));
    expect(history).toHaveLength(3);
    expect(await resourceEvidence(stateId)).toEqual(resourcesBefore);
    await expect(
      database
        .select()
        .from(annotations)
        .where(eq(annotations.id, annotationId)),
    ).resolves.toEqual([
      expect.objectContaining({
        id: annotationId,
        sourceStateId: stateId,
        normalizedStartOffset: start,
        exactText,
      }),
    ]);

    const ambiguousId = randomUUID();
    const ambiguousReading = structuredClone(reading);
    const ambiguousComponent = ambiguousReading.components[0];
    if (!ambiguousComponent) throw new Error("Reading component missing");
    ambiguousComponent.plainText = `Preface\n${component.plainText}\n\n${component.plainText}`;
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
    const ambiguousConsequences = await updates.previewActivation({
      sourceId,
      stateId,
      derivativeId: ambiguousId,
    });
    expect(ambiguousConsequences?.relocations).toContainEqual(
      expect.objectContaining({
        recordId: annotationId,
        classification: "ambiguous",
        target: undefined,
      }),
    );
    if (!ambiguousConsequences)
      throw new Error("Ambiguous activation preview missing");
    await updates.activate({
      sourceId,
      stateId,
      derivativeId: ambiguousId,
      actorId: "user-1",
      reason: "Reviewed ambiguous preservation",
      expectedConsequences: ambiguousConsequences,
    });
    await expect(
      database
        .select()
        .from(annotations)
        .where(eq(annotations.id, annotationId)),
    ).resolves.toEqual([
      expect.objectContaining({
        componentIdentity: component.identity,
        normalizedStartOffset: start,
        exactText,
      }),
    ]);
  });

  test("keeps invalid candidates inactive", async () => {
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:invalid-derivative-${previewId}`,
      title: "Invalid derivative integration",
      observations: ["submitted"],
      now: new Date(),
    });
    const admitted = await admission.admit(
      previewId,
      ["submitted"],
      new Date(),
    );
    const sourceId = admitted?.sourceId;
    const stateId = admitted?.states[0]?.id;
    if (!sourceId || !stateId) throw new Error("Admission failed");
    const invalidId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      id: invalidId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: false,
      generation: {
        version: 2,
        parser: { id: "parse5", version: "7.3.0" },
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: [],
      },
      payload: { version: 2 },
      validation: {
        status: "invalid",
        checks: [],
        comparison: emptyComparison(),
      },
    });

    await expect(admission.getState(sourceId, stateId)).resolves.toMatchObject({
      derivatives: expect.arrayContaining([
        expect.objectContaining({ id: invalidId, valid: false }),
      ]),
    });

    await expect(
      updates.activate({
        sourceId,
        stateId,
        derivativeId: invalidId,
        actorId: "user-1",
        reason: "Must remain blocked",
        expectedConsequences: emptyComparison(),
      }),
    ).resolves.toBeUndefined();
    const invalidActivations = await database
      .select()
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.derivativeId, invalidId));
    expect(invalidActivations).toHaveLength(0);
  });
});

function emptyComparison() {
  return {
    semantic: { changedComponents: [] },
    structure: [],
    diagnostics: { added: [], removed: [] },
    relocations: [],
  };
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
