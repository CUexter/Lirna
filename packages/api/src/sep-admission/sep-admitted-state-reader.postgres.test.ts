import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sourceStateDerivativeActivations } from "@lirna/db/schema/sources";
import { eq } from "drizzle-orm";

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

describePostgres("SEP admitted-state PostgreSQL reader", () => {
  beforeAll(async () => {
    if (!sepAdmissionPostgresAdminUrl) return;
    const opened = await openSepAdmissionPostgres("reader");
    database = opened.database;
    store = opened.store;
    cleanupDatabase = opened.cleanup;
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("returns a safe typed Reading for an admitted state", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    const mainBody = Buffer.from(
      "<html><body><main><h2>Knowledge</h2><p>A typed paragraph.</p><script>window.pwned = true</script></main></body></html>",
      "utf8",
    );
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:reading-${previewId}`,
      title: "Reading integration",
      observations: ["submitted"],
      bodies: { submitted: mainBody },
      citationBody: Buffer.from("citation evidence", "utf8"),
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const stateId = admitted?.states[0]?.id;
    expect(stateId).toBeDefined();

    const reading = await store.getReading(
      admitted?.sourceId ?? "",
      stateId ?? "",
    );
    expect(reading).toMatchObject({
      source: { title: "Reading integration" },
      sections: [
        {
          title: [{ kind: "text", text: "Knowledge" }],
          blocks: [
            {
              kind: "paragraph",
              children: [{ kind: "text", text: "A typed paragraph." }],
            },
          ],
        },
      ],
      provenance: {
        adapter: { id: "sep", version: "1" },
        parser: { id: "parse5", version: "7.3.0" },
      },
    });
    expect(JSON.stringify(reading)).not.toContain("window.pwned");
    const activations = await database
      .select({ derivativeId: sourceStateDerivativeActivations.derivativeId })
      .from(sourceStateDerivativeActivations)
      .where(eq(sourceStateDerivativeActivations.sourceStateId, stateId ?? ""));
    expect(activations).toHaveLength(1);
  });

  test("returns the admitted Source state", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    await insertPreview(database, {
      id: previewId,
      stableKey: `sep:state-${previewId}`,
      title: "Reading integration",
      observations: ["submitted"],
      now: admittedAt,
    });

    const admitted = await store.admit(previewId, ["submitted"], admittedAt);
    const state = admitted?.states[0];
    expect(state).toBeDefined();
    expect(
      await store.getState(admitted?.sourceId ?? "", state?.id ?? ""),
    ).toEqual(state);
    expect(
      await store.getState(admitted?.sourceId ?? "", randomUUID()),
    ).toBeUndefined();
  });
});
