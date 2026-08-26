import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
} from "@lirna/db/schema/sources";
import { asc, eq, sql } from "drizzle-orm";
import { DrizzleActiveReadingDerivativeStore } from "./active-reading-derivative-store";
import {
  insertPreview,
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "./fixtures/postgres";

const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;
let opened: SepAdmissionPostgres;

describePostgres("active Reading Derivative sequence migration", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    opened = await openSepAdmissionPostgres("activation-sequence-migration");
  }, 30_000);

  afterAll(async () => {
    await opened?.cleanup();
  });

  test("backfills populated Activation history in its previous order", async () => {
    const previewId = randomUUID();
    await insertPreview(opened.database, {
      id: previewId,
      stableKey: `sep:migration-${previewId}`,
      observations: ["submitted"],
    });
    const admitted = await opened.store.admit(
      previewId,
      ["submitted"],
      new Date("2026-08-25T00:00:00.000Z"),
    );
    const sourceId = admitted?.sourceId;
    const stateId = admitted?.states[0]?.id;
    const reading =
      sourceId && stateId
        ? await opened.store.getReading(sourceId, stateId)
        : undefined;
    if (!sourceId || !stateId || !reading) throw new Error("Admission failed");

    const newestDerivativeId = randomUUID();
    await opened.database.insert(sourceStateDerivatives).values({
      id: newestDerivativeId,
      sourceStateId: stateId,
      kind: "sep-reading-v1",
      valid: true,
      generation: {
        version: 2,
        parser: reading.provenance.parser,
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: reading.provenance.inputResourceHashes,
      },
      payload: reading,
      validation: { schema: "sep-reading-v1", status: "valid" },
    });
    await opened.database.insert(sourceStateDerivativeActivations).values({
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      sourceStateId: stateId,
      derivativeId: newestDerivativeId,
      kind: "sep-reading-v1",
      sequence: 2,
      activatedAt: new Date("2026-08-25T00:00:00.000Z"),
    });

    await restorePreviousActivationSchema();
    await applySequenceMigration();

    const history = await opened.database
      .select({ sequence: sourceStateDerivativeActivations.sequence })
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId))
      .orderBy(asc(sourceStateDerivativeActivations.sequence));
    expect(history).toEqual([{ sequence: 1 }, { sequence: 2 }]);
    await expect(
      new DrizzleActiveReadingDerivativeStore(opened.database).read({
        sourceId,
        stateId,
      }),
    ).resolves.toMatchObject({
      status: "active",
      value: { derivativeId: newestDerivativeId, activationSequence: 2 },
    });
  });
});

async function restorePreviousActivationSchema() {
  await opened.database.execute(
    sql.raw(
      'ALTER TABLE "source_state_derivative_activations" DROP CONSTRAINT "source_state_derivative_activations_sequence_check"',
    ),
  );
  await opened.database.execute(
    sql.raw('DROP INDEX "source_state_derivative_activations_sequence_uidx"'),
  );
  await opened.database.execute(
    sql.raw('DROP INDEX "source_state_derivative_activations_current_idx"'),
  );
  await opened.database.execute(
    sql.raw(
      'ALTER TABLE "source_state_derivative_activations" DROP COLUMN "sequence"',
    ),
  );
  await opened.database.execute(
    sql.raw(
      'CREATE INDEX "source_state_derivative_activations_current_idx" ON "source_state_derivative_activations" ("source_state_id", "kind", "activated_at")',
    ),
  );
}

async function applySequenceMigration() {
  const migration = await Bun.file(
    resolve(
      import.meta.dir,
      "../../../db/src/migrations/0014_needy_korvac.sql",
    ),
  ).text();
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await opened.database.execute(sql.raw(statement));
  }
}
