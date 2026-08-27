import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
} from "@lirna/db/schema/sources";
import { eq, sql } from "drizzle-orm";

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
let createReadingWorkspaceReader: typeof import("./reading-workspace-reader")["createReadingWorkspaceReader"];

describePostgres("Reading workspace PostgreSQL module", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("reading-workspace");
    database = opened.database;
    admission = opened.store;
    cleanupDatabase = opened.cleanup;
    ({ createReadingWorkspaceReader } = await import(
      "./reading-workspace-reader"
    ));
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("returns one database observation during a concurrent activation and Citation resolution", async () => {
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:workspace-${previewId}`,
      observations: ["submitted"],
    });
    const admitted = await admission.admit(
      previewId,
      ["submitted"],
      new Date(),
    );
    const sourceId = admitted?.sourceId;
    const stateId = admitted?.states[0]?.id;
    if (!(sourceId && stateId)) throw new Error("Admission fixture is missing");

    const initial = await createReadingWorkspaceReader(database).read(
      sourceId,
      stateId,
    );
    const initialDerivative = initial?.state.derivatives.find(
      (derivative) => derivative.currentActivation,
    );
    if (!(initial && initialDerivative?.currentActivation)) {
      throw new Error("Initial Reading workspace is missing");
    }
    const [stored] = await database
      .select()
      .from(sourceStateDerivatives)
      .where(eq(sourceStateDerivatives.id, initialDerivative.id));
    if (!stored) throw new Error("Initial Reading Derivative is missing");
    const nextDerivativeId = randomUUID();
    await database.insert(sourceStateDerivatives).values({
      ...stored,
      id: nextDerivativeId,
      previousDerivativeId: stored.id,
      generation: {
        ...(stored.generation as object),
        version: 2,
      },
    });

    const concurrentResolutionId = randomUUID();
    const reader = createReadingWorkspaceReader(database, async () => {
      await database.insert(sourceStateDerivativeActivations).values({
        sourceStateId: stateId,
        derivativeId: nextDerivativeId,
        kind: "sep-reading-v1",
        sequence: (initialDerivative.currentActivation?.sequence ?? 1) + 1,
        actorId: "user-1",
        reason: "Concurrent reviewed activation",
        consequences: initialDerivative.currentActivation?.consequences,
      });
      const component = initial.reading.components[0];
      if (!component) throw new Error("Reading component is missing");
      await database.insert(citationResolutions).values({
        id: concurrentResolutionId,
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

    const during = await reader.read(sourceId, stateId);
    expect(
      during?.state.derivatives.find(
        (derivative) => derivative.currentActivation,
      )?.id,
    ).toBe(initialDerivative.id);
    expect(during?.citationResolutions).toEqual([]);

    const after = await createReadingWorkspaceReader(database).read(
      sourceId,
      stateId,
    );
    expect(
      after?.state.derivatives.find(
        (derivative) => derivative.currentActivation,
      )?.id,
    ).toBe(nextDerivativeId);
    expect(after?.citationResolutions).toMatchObject([
      { id: concurrentResolutionId, derivativeId: nextDerivativeId },
    ]);
  });

  test("returns unavailable without an active Reading Derivative", async () => {
    const previewId = randomUUID();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:workspace-unavailable-${previewId}`,
      observations: ["submitted"],
    });
    const admitted = await admission.admit(
      previewId,
      ["submitted"],
      new Date(),
    );
    const sourceId = admitted?.sourceId;
    const stateId = admitted?.states[0]?.id;
    if (!(sourceId && stateId)) throw new Error("Admission fixture is missing");
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('lirna.allow_immutable_deletion', 'on', true)`,
      );
      await tx
        .delete(sourceStateDerivativeActivations)
        .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId));
    });

    const reader = createReadingWorkspaceReader(database);
    await expect(reader.read(sourceId, stateId)).resolves.toBeUndefined();
    await expect(reader.read(randomUUID(), stateId)).resolves.toBeUndefined();
  });
});
