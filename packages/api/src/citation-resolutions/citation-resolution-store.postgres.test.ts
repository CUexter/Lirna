import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq } from "drizzle-orm";

import { readingPayload } from "../annotations/annotation-store.postgres-test-support";
import { generationMetadata } from "../derivative-updates/derivative-test-fixture";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_citation_resolutions_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = randomUUID();
const stateId = randomUUID();
const actorId = "authenticated-user-1";
const resourceBody = Buffer.from(
  "immutable captured citation evidence",
  "utf8",
);

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./citation-resolution-store")["DrizzleCitationResolutionStore"]
>;

describePostgres("Citation resolution PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    process.env.DATABASE_URL = testDatabase.databaseUrl;
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.NODE_ENV = "test";

    const { DrizzleCitationResolutionStore } = await import(
      "./citation-resolution-store"
    );
    store = new DrizzleCitationResolutionStore(database);
    await database.insert(sources).values({
      id: sourceId,
      title: "Citation evidence",
      stableKey: `citation:${sourceId}`,
    });
    await database.insert(sourceStates).values({
      id: stateId,
      sourceId,
      sequence: 0,
      adapterId: "test",
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    });
    const payload = ambiguousReading();
    const [derivative] = await database
      .insert(sourceStateDerivatives)
      .values({
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: generationMetadata(payload.provenance.inputResourceHashes),
        payload,
        validation: { schema: "sep-reading-v1", status: "valid" },
      })
      .returning({ id: sourceStateDerivatives.id });
    await database.insert(sourceStateDerivativeActivations).values({
      sourceStateId: stateId,
      derivativeId: derivative?.id ?? "",
      kind: "sep-reading-v1",
    });
    await database.insert(sourceStateResources).values({
      sourceStateId: stateId,
      observationKey: "submitted",
      identity: "active:/",
      role: "main",
      requestedUrl: "https://example.com/article",
      finalUrl: "https://example.com/article",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      retrievedAt: new Date("2026-08-24T00:00:00.000Z"),
      selectedHeaders: {},
      requestCount: 1,
      downloadedBytes: resourceBody.byteLength,
      byteLength: resourceBody.byteLength,
      sha256: createHash("sha256").update(resourceBody).digest("hex"),
      discoveryEdge: "submitted-entry",
      depth: 0,
      body: resourceBody,
    });
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("bounds stable evidence without mutating the derivative or resource", async () => {
    const before = await evidenceSnapshot();
    const evidence = await store.evidence(sourceId, stateId);
    expect(evidence).toHaveLength(1);
    expect(evidence?.[0]).toMatchObject({
      componentIdentity: "article:main",
      mentionId: "citation-mention-1",
      label: "Read",
      state: "ambiguous",
      policy: { inferenceEligible: true },
    });
    expect(evidence?.[0]?.candidates).toHaveLength(12);
    expect(evidence?.[0]?.candidates[0]).toMatchObject({
      bibliographyComponentIdentity: "article:main",
      bibliographyEntryId: "entry-01",
      label: "[1]",
    });
    expect(await evidenceSnapshot()).toEqual(before);
  });

  test("rejects out-of-set targets and appends correction and clear history", async () => {
    const evidenceBefore = await evidenceSnapshot();
    await expect(store.create(selection("entry-13"))).rejects.toMatchObject({
      name: "InvalidCitationResolutionError",
    });

    const first = await store.create(selection("entry-01"));
    expect(first).toMatchObject({
      actorId,
      method: "manual",
      mentionId: "citation-mention-1",
      bibliographyEntryId: "entry-01",
      exactText: "Read",
      confidence: null,
      reasoning: null,
    });
    expect(first?.createdAt).toBe(first?.updatedAt);

    const corrected = await store.create(selection("entry-02"));
    expect(corrected?.bibliographyEntryId).toBe("entry-02");
    expect(await store.list(sourceId, stateId)).toMatchObject([
      { bibliographyEntryId: "entry-02" },
    ]);

    expect(
      await store.clear({
        sourceId,
        stateId,
        componentIdentity: "article:main",
        mentionId: "citation-mention-1",
        actorId,
      }),
    ).toBeTrue();
    expect(await store.list(sourceId, stateId)).toEqual([]);
    const history = await store.history(sourceId, stateId);
    expect(history.map(({ action }) => action)).toEqual([
      "selected",
      "selected",
      "cleared",
    ]);
    expect(
      history.every((decision) => decision.actorId === actorId),
    ).toBeTrue();
    expect(history[2]).toMatchObject({
      bibliographyComponentIdentity: null,
      bibliographyEntryId: null,
      method: "manual",
    });
    expect(await evidenceSnapshot()).toEqual(evidenceBefore);
  });

  test("enforces action, method, target, confidence, and Source ownership constraints", async () => {
    const valid = {
      sourceStateId: stateId,
      derivativeId:
        (
          await database
            .select({ id: sourceStateDerivatives.id })
            .from(sourceStateDerivatives)
        )[0]?.id ?? "",
      componentIdentity: "article:main",
      mentionId: "constraint-check",
      bibliographyComponentIdentity: null,
      bibliographyEntryId: null,
      publisherAnchor: "citation-mention-1",
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 0,
      normalizedEndOffset: 4,
      exactText: "Read",
      prefix: "",
      suffix: " evidence carefully.",
      actorId,
      action: "selected",
      method: "inferred",
      confidence: 2,
      reasoning: "invalid confidence",
    };
    await expect(
      database.insert(citationResolutions).values(valid).execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      database
        .insert(citationResolutions)
        .values({
          ...valid,
          sourceStateId: randomUUID(),
          bibliographyComponentIdentity: "article:main",
          bibliographyEntryId: "entry-01",
          confidence: 0.5,
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    expect(await store.evidence(randomUUID(), stateId)).toBeUndefined();
  });
});

function selection(bibliographyEntryId: string) {
  return {
    sourceId,
    stateId,
    componentIdentity: "article:main",
    mentionId: "citation-mention-1",
    bibliographyComponentIdentity: "article:main",
    bibliographyEntryId,
    actorId,
    method: "manual" as const,
  };
}

function ambiguousReading() {
  const payload = readingPayload(sourceId, stateId);
  const component = payload.components[0];
  if (!component) throw new Error("Reading fixture has no component");
  const citation = component.sections[0]?.title[0];
  if (citation?.kind !== "citation") {
    throw new Error("Reading fixture has no Citation mention");
  }
  const entries = Array.from({ length: 13 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `entry-${number}`,
      label: `[${index + 1}]`,
      text: `Candidate ${index + 1}`,
      anchor: `entry-${number}`,
      links: [],
      provenance: {
        componentIdentity: component.identity,
        locator: `#entry-${number}`,
      },
    };
  });
  citation.state = "ambiguous";
  citation.candidates = entries.map((entry) => entry.id);
  component.bibliography = [
    {
      id: "references",
      title: "References",
      entries,
      provenance: {
        componentIdentity: component.identity,
        locator: "#references",
      },
    },
  ];
  return payload;
}

async function evidenceSnapshot() {
  const [derivative] = await database
    .select({ payload: sourceStateDerivatives.payload })
    .from(sourceStateDerivatives)
    .where(eq(sourceStateDerivatives.sourceStateId, stateId));
  const [resource] = await database
    .select({
      body: sourceStateResources.body,
      sha256: sourceStateResources.sha256,
    })
    .from(sourceStateResources)
    .where(eq(sourceStateResources.sourceStateId, stateId));
  return {
    payload: derivative?.payload,
    body: resource?.body.toString("hex"),
    sha256: resource?.sha256,
  };
}
