import { createHash, randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";

import type { createDb } from "../index";
import { sepAdmissionPreviews, sepPreviewResources, sources } from "../schema";

export async function verifySepAdmissionPersistence(
  database: ReturnType<typeof createDb>,
) {
  const previewId = randomUUID();
  const body = Buffer.from("exact temporary SEP evidence", "utf8");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const [sourcesBefore] = await database
    .select({ value: count() })
    .from(sources);

  await database.transaction(async (tx) => {
    await tx.insert(sepAdmissionPreviews).values({
      id: previewId,
      stableKey: "sep:temporary-integration",
      submittedUrl: "https://plato.stanford.edu/entries/temporary-integration/",
      title: "Temporary integration entry",
      authors: ["Integration Author"],
      publisher: "Metaphysics Research Lab, Stanford University",
      publicationHistory: ["First published 2026"],
      diagnostics: [],
      captureDiagnostics: {
        budget: "standard",
        completeness: "complete",
        readingReadiness: "ready",
        readinessReasons: [],
        unresolvedResources: [],
        limits: {
          maxComponents: 64,
          maxAssets: 256,
          maxResourceBytes: 50 * 1024 * 1024,
          maxTotalBytes: 250 * 1024 * 1024,
          maxDepth: 8,
          maxRedirects: 5,
          timeoutMilliseconds: 15_000,
          maxConcurrency: 4,
        },
        retryUsed: false,
      },
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
      processingMilliseconds: 9,
      createdAt: new Date("2026-08-17T12:00:00.000Z"),
      expiresAt: new Date("2026-08-24T12:00:00.000Z"),
    });
    await tx
      .insert(sepPreviewResources)
      .values([
        resource(previewId, "main", body, sha256),
        resource(previewId, "citation-information", body, sha256),
      ]);
  });

  const retained = await database
    .select({
      role: sepPreviewResources.role,
      body: sepPreviewResources.body,
      requestCount: sepPreviewResources.requestCount,
      downloadedBytes: sepPreviewResources.downloadedBytes,
    })
    .from(sepPreviewResources)
    .where(eq(sepPreviewResources.previewId, previewId));
  if (
    retained.length !== 2 ||
    retained.some(
      (item) =>
        !item.body.equals(body) ||
        item.requestCount !== 1 ||
        item.downloadedBytes !== body.byteLength,
    )
  ) {
    throw new Error(
      "SEP preview resources did not retain exact bytes and metrics",
    );
  }

  await database
    .delete(sepAdmissionPreviews)
    .where(eq(sepAdmissionPreviews.id, previewId));
  const remaining = await database
    .select({ id: sepPreviewResources.id })
    .from(sepPreviewResources)
    .where(eq(sepPreviewResources.previewId, previewId));
  const [sourcesAfter] = await database
    .select({ value: count() })
    .from(sources);
  if (remaining.length !== 0 || sourcesAfter?.value !== sourcesBefore?.value) {
    throw new Error(
      "Deleting a preview must cascade only to temporary resources",
    );
  }
}

function resource(
  previewId: string,
  role: string,
  body: Buffer,
  sha256: string,
) {
  return {
    previewId,
    observationKey: "submitted",
    identity: role === "main" ? "active:/" : "citation-information:integration",
    role,
    requestedUrl: `https://plato.stanford.edu/${role}`,
    finalUrl: `https://plato.stanford.edu/${role}`,
    status: 200,
    mediaType: "text/html; charset=utf-8",
    charset: "utf-8",
    retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    requestCount: 1,
    downloadedBytes: body.byteLength,
    byteLength: body.byteLength,
    sha256,
    discoveryEdge:
      role === "main" ? "submitted-entry" : "required-citation-information",
    depth: 0,
    body,
  };
}
