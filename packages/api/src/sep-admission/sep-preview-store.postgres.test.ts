import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sources } from "@lirna/db/schema/sources";

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

describePostgres("SEP preview-lifecycle PostgreSQL store", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("preview");
    database = opened.database;
    store = opened.store;
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("marks expanded retry unavailable after admission", async () => {
    const previewId = await insertPreview(database, {
      stableKey: `sep:preview-${randomUUID()}`,
      observations: ["submitted"],
    });

    await store.admit(previewId, ["submitted"], new Date());
    expect(await store.claimExpandedRetry(previewId, new Date())).toBe(
      "unavailable",
    );

    const stableSources = await database
      .select({ id: sources.id })
      .from(sources);
    expect(stableSources).toHaveLength(1);
  });
});
