import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import {
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { asc, eq } from "drizzle-orm";

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

describePostgres("SEP Admission PostgreSQL store", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("admit");
    database = opened.database;
    store = opened.store;
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("retains exact evidence as immutable Source-state resources", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    const mainBody = Buffer.from(
      "<html><body><main><h2>Knowledge</h2><p>A typed paragraph.</p><script>window.pwned = true</script></main></body></html>",
      "utf8",
    );
    const citationBody = Buffer.from("citation evidence", "utf8");
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:reading-${previewId}`,
      title: "Reading integration",
      observations: ["submitted"],
      bodies: { submitted: mainBody },
      citationBody,
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const stateId = admitted?.states[0]?.id;
    expect(stateId).toBeDefined();

    const [retained] = await database
      .select({
        body: sourceStateResources.body,
        sha256: sourceStateResources.sha256,
      })
      .from(sourceStateResources)
      .where(eq(sourceStateResources.sourceStateId, stateId ?? ""));
    expect(retained).toEqual({ body: mainBody, sha256: hash(mainBody) });
    await expect(
      database
        .update(sepSourceStateMetadata)
        .set({ title: "Mutated title" })
        .where(eq(sepSourceStateMetadata.sourceStateId, stateId ?? ""))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
    await expect(
      database
        .update(sourceStateResources)
        .set({ body: Buffer.from("mutated evidence", "utf8") })
        .where(eq(sourceStateResources.sourceStateId, stateId ?? ""))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
  });

  test("reuses stable Sources and serializes repeated and concurrent admissions", async () => {
    const stableKey = `sep:admission-${randomUUID()}`;
    const firstPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted", "recommended-archive"],
    });

    const first = await store.admit(
      firstPreviewId,
      ["recommended-archive", "submitted"],
      new Date(),
    );
    const repeated = await store.admit(
      firstPreviewId,
      ["submitted", "recommended-archive"],
      new Date(),
    );

    expect(
      first?.states.map(({ sequence, observationKey }) => ({
        sequence,
        observationKey,
      })),
    ).toEqual([
      { sequence: 0, observationKey: "submitted" },
      { sequence: 1, observationKey: "recommended-archive" },
    ]);
    expect(repeated).toEqual(first);
    expect(repeated?.states.map(({ sequence }) => sequence)).toEqual([0, 1]);

    const secondPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
    });
    const concurrent = await Promise.all([
      store.admit(secondPreviewId, ["submitted"], new Date()),
      store.admit(secondPreviewId, ["submitted"], new Date()),
    ]);
    expect(concurrent[0]).toEqual(concurrent[1]);
    expect(concurrent[0]?.sourceId).toBe(first?.sourceId);
    expect(concurrent[0]?.states[0]?.sequence).toBe(2);

    const stableSources = await database
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.stableKey, stableKey));
    expect(stableSources).toHaveLength(1);
    const states = await database
      .select({ sequence: sourceStates.sequence })
      .from(sourceStates)
      .where(eq(sourceStates.sourceId, first?.sourceId ?? ""))
      .orderBy(asc(sourceStates.sequence));
    expect(states.map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
    expect(await store.claimExpandedRetry(firstPreviewId, new Date())).toBe(
      "unavailable",
    );
  });

  test("rolls back every permanent record when derivative creation fails", async () => {
    const stableKey = `sep:rollback-${randomUUID()}`;
    const previewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
      charset: "definitely-not-a-real-encoding",
    });

    await expect(
      store.admit(previewId, ["submitted"], new Date()),
    ).rejects.toThrow("unsupported character encoding");

    expect(
      await database
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.stableKey, stableKey)),
    ).toEqual([]);
    expect(
      await database
        .select({ id: sepSourceStateMetadata.sourceStateId })
        .from(sepSourceStateMetadata)
        .where(eq(sepSourceStateMetadata.admissionPreviewId, previewId)),
    ).toEqual([]);
  });
});
