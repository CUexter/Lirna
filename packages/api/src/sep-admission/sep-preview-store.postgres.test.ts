import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sources } from "@lirna/db/schema/sources";

import {
  admissionCreateRecord,
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

  test("creates a preview that getActive can read", async () => {
    const now = new Date();
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
    });
    await store.create(record);

    const active = await store.getActive(record.id, now);
    expect(active?.preview.title).toBe("Admission integration");
    expect(active?.preview.submittedUrl).toBe(
      "https://plato.stanford.edu/entries/admission/",
    );
    expect(active?.resources.map(({ identity }) => identity)).toEqual([
      "citation-information:admission",
      "active:/",
    ]);
  });

  test("getActive hides an expired preview", async () => {
    const createdAt = new Date(Date.now() - 120_000);
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now: createdAt,
      expiresAt: new Date(createdAt.getTime() + 60_000),
    });
    await store.create(record);

    expect(await store.getActive(record.id, new Date())).toBeUndefined();
  });

  test("extendActive keeps a live preview readable", async () => {
    const now = new Date();
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
      expiresAt: new Date(now.getTime() + 1_000),
    });
    await store.create(record);
    const extendedUntil = new Date(now.getTime() + 60_000);
    const midpoint = new Date(now.getTime() + 30_000);

    expect(await store.extendActive(record.id, now, extendedUntil)).toBe(true);
    expect((await store.getActive(record.id, midpoint))?.preview.id).toBe(
      record.id,
    );
  });

  test("delete removes the preview", async () => {
    const now = new Date();
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
    });
    await store.create(record);

    expect(await store.delete(record.id)).toBe(true);
    expect(await store.getActive(record.id, now)).toBeUndefined();
  });

  test("deleteExpired removes only expired previews", async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 120_000);
    const expired = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now: createdAt,
      expiresAt: new Date(createdAt.getTime() + 60_000),
    });
    const live = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
    });
    await store.create(expired);
    await store.create(live);

    expect(await store.deleteExpired(now)).toBeGreaterThanOrEqual(1);
    expect(await store.getActive(expired.id, now)).toBeUndefined();
    expect((await store.getActive(live.id, now))?.preview.id).toBe(live.id);
  });

  test("claimExpandedRetry claims once then reports already-used", async () => {
    const now = new Date();
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
    });
    await store.create(record);

    expect(await store.claimExpandedRetry(record.id, now)).toBe("claimed");
    expect(await store.claimExpandedRetry(record.id, now)).toBe("already-used");
  });

  test("replaceCapture updates the live preview title", async () => {
    const now = new Date();
    const record = admissionCreateRecord({
      stableKey: `sep:preview-${randomUUID()}`,
      now,
    });
    await store.create(record);
    const {
      id: _id,
      createdAt: _createdAt,
      expiresAt: _expiresAt,
      ...replacement
    } = admissionCreateRecord({
      stableKey: record.stableKey,
      title: "Replaced preview",
      now,
    });

    expect(await store.replaceCapture(record.id, now, replacement)).toBe(
      "updated",
    );
    expect((await store.getActive(record.id, now))?.preview.title).toBe(
      "Replaced preview",
    );
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
    expect(
      await store.replaceCapture(
        previewId,
        new Date(),
        admissionCreateRecord({
          stableKey: `sep:preview-${randomUUID()}`,
        }),
      ),
    ).toBe("unavailable");

    const stableSources = await database
      .select({ id: sources.id })
      .from(sources);
    expect(stableSources).toHaveLength(1);
  });

  test("locks capture replacement after an unchanged admission", async () => {
    const stableKey = `sep:unchanged-lock-${randomUUID()}`;
    const firstPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
    });
    await store.admit(firstPreviewId, ["submitted"], new Date());
    const unchangedPreviewId = await insertPreview(database, {
      stableKey,
      observations: ["submitted"],
    });

    const admitted = await store.admit(
      unchangedPreviewId,
      ["submitted"],
      new Date(),
    );
    expect(admitted?.outcomes[0]?.disposition).toBe("unchanged");
    expect(await store.claimExpandedRetry(unchangedPreviewId, new Date())).toBe(
      "unavailable",
    );
    expect(
      await store.replaceCapture(
        unchangedPreviewId,
        new Date(),
        admissionCreateRecord({ stableKey }),
      ),
    ).toBe("unavailable");
  });
});
