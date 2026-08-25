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
  observationHtml,
  readingIntegrationHtml,
} from "./fixtures/admission-preview";
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
    const mainBody = Buffer.from(readingIntegrationHtml, "utf8");
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

  test("keeps active and archived observation metadata and resources distinct", async () => {
    const previewId = randomUUID();
    const activeBody = Buffer.from(
      observationHtml({
        title: "Active title",
        author: "Active Author",
        publisher: "Active Publisher",
        issued: "2025-01-02",
        modified: "2026-03-04",
      }),
    );
    const archiveBody = Buffer.from(
      observationHtml({
        title: "Archived title",
        author: "Archive Author",
        publisher: "Archive Publisher",
        issued: "2001-05-06",
        modified: "2010-07-08",
      }),
    );
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:metadata-${previewId}`,
      title: "Active title",
      authors: ["Active Author"],
      publisher: "Active Publisher",
      publicationHistory: ["First published 2025", "Revised 2026"],
      observations: ["submitted", "recommended-archive"],
      bodies: { submitted: activeBody, "recommended-archive": archiveBody },
    });

    const admitted = await store.admit(
      previewId,
      ["submitted", "recommended-archive"],
      new Date(),
    );

    expect(admitted?.states).toMatchObject([
      {
        observationKey: "submitted",
        title: "Active title",
        authors: ["Active Author"],
        publisher: "Active Publisher",
        publicationHistory: ["First published 2025", "Revised 2026"],
        resources: [{ role: "citation-information" }, { role: "main" }],
      },
      {
        observationKey: "recommended-archive",
        title: "Archived title",
        authors: ["Archive Author"],
        publisher: "Archive Publisher",
        publicationHistory: [
          "First published 2001-05-06",
          "Revised 2010-07-08",
        ],
        resources: [{ role: "main" }],
      },
    ]);
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
      bodies: { submitted: Buffer.from("new concurrent revision") },
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

  test("rejects a different observation selection after admission", async () => {
    const previewId = await insertPreview(database, {
      stableKey: `sep:mismatch-${randomUUID()}`,
      observations: ["submitted", "recommended-archive"],
    });
    await store.admit(previewId, ["submitted"], new Date());

    await expect(
      store.admit(previewId, ["submitted", "recommended-archive"], new Date()),
    ).rejects.toThrow(
      "This preview was already admitted with a different observation selection",
    );
  });

  test("rejects a missing observation", async () => {
    const previewId = await insertPreview(database, {
      stableKey: `sep:missing-${randomUUID()}`,
      observations: ["submitted"],
    });

    await expect(
      store.admit(previewId, ["recommended-archive"], new Date()),
    ).rejects.toThrow(
      "Recommended archive observation is unavailable for admission",
    );
  });
});
