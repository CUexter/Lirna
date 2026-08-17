// biome-ignore lint/style/noExcessiveLinesPerFile: The PostgreSQL scenarios share one lifecycle fixture and verify the admission transaction as a whole.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import {
  sepAdmissionPreviews,
  sepPreviewResources,
  sepSourceStateMetadata,
} from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { asc, eq } from "drizzle-orm";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_api_integration_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./sep-admission-store")["DrizzleSepAdmissionStore"]
>;

describePostgres("SEP Admission PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) {
      return;
    }

    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    process.env.DATABASE_URL = testDatabase.databaseUrl;
    process.env.BETTER_AUTH_SECRET =
      "integration-only-secret-at-least-32-chars";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "test";

    const { DrizzleSepAdmissionStore } = await import("./sep-admission-store");
    store = new DrizzleSepAdmissionStore(database);
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("retains exact evidence and creates a safe typed Reading", async () => {
    const previewId = randomUUID();
    const admittedAt = new Date();
    const mainBody = Buffer.from(
      "<html><body><main><h2>Knowledge</h2><p>A typed paragraph.</p><script>window.pwned = true</script></main></body></html>",
      "utf8",
    );
    const citationBody = Buffer.from("citation evidence", "utf8");
    await insertPreview({
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
    const firstPreviewId = await insertPreview({
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

    const secondPreviewId = await insertPreview({
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
    const previewId = await insertPreview({
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

async function insertPreview({
  id = randomUUID(),
  stableKey,
  title = "Admission integration",
  observations,
  bodies,
  citationBody = Buffer.from("citation"),
  charset = "utf-8",
  now = new Date(),
}: {
  id?: string;
  stableKey: string;
  title?: string;
  observations: Array<"submitted" | "recommended-archive">;
  bodies?: Partial<Record<"submitted" | "recommended-archive", Buffer>>;
  citationBody?: Buffer;
  charset?: string;
  now?: Date;
}) {
  await database.insert(sepAdmissionPreviews).values({
    id,
    stableKey,
    submittedUrl: "https://plato.stanford.edu/entries/admission/",
    recommendedArchiveUrl: observations.includes("recommended-archive")
      ? "https://plato.stanford.edu/archives/sum2026/entries/admission/"
      : null,
    title,
    authors: ["Integration Author"],
    publisher: "Metaphysics Research Lab, Stanford University",
    publicationHistory: ["First published 2026"],
    diagnostics: [],
    captureDiagnostics: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
    },
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
    processingMilliseconds: 1,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await database.insert(sepPreviewResources).values(
    observations.flatMap((observation) => {
      const body =
        bodies?.[observation] ??
        Buffer.from(
          `<html><body><main><p>${observation}</p></main></body></html>`,
        );
      return [
        previewResource({
          previewId: id,
          role: "main",
          identity: observation === "submitted" ? "active:/" : "sum2026:/",
          body,
          observationKey: observation,
          charset,
        }),
        ...(observation === "submitted"
          ? [
              previewResource({
                previewId: id,
                role: "citation-information",
                identity: "citation-information:admission",
                body: citationBody,
              }),
            ]
          : []),
      ];
    }),
  );
  return id;
}

function previewResource({
  previewId,
  role,
  identity,
  body,
  observationKey = "submitted",
  charset = "utf-8",
}: {
  previewId: string;
  role: "main" | "citation-information";
  identity: string;
  body: Buffer;
  observationKey?: "submitted" | "recommended-archive";
  charset?: string;
}) {
  const url =
    role === "main"
      ? "https://plato.stanford.edu/entries/reading/"
      : "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=reading";
  return {
    id: randomUUID(),
    previewId,
    observationKey,
    identity,
    role,
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    mediaType: "text/html",
    charset,
    retrievedAt: new Date(),
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    requestCount: 1,
    downloadedBytes: body.byteLength,
    byteLength: body.byteLength,
    sha256: hash(body),
    discoveryEdge:
      role === "main" ? "submitted-entry" : "required-citation-information",
    depth: 0,
    body,
  };
}

function hash(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}
