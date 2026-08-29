import type {
  SepAdmissionCreateRecord,
  SepAdmissionStoredPreview,
} from "../admission/operations";

export function resource(
  role: "main" | "citation-information",
  body: Buffer,
  observationKey: "submitted" | "recommended-archive" = "submitted",
) {
  return {
    observationKey,
    identity:
      role === "main"
        ? `${observationKey === "submitted" ? "active" : "sum2026"}:/`
        : "citation-information:logic",
    role,
    byteLength: body.byteLength,
    downloadedBytes: body.byteLength,
    requestCount: 1,
    retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
    requestedUrl: `https://plato.stanford.edu/${role}`,
    finalUrl: `https://plato.stanford.edu/${role}`,
    charset: "utf-8",
    mediaType: "text/html; charset=utf-8",
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    status: 200,
    sha256:
      observationKey === "recommended-archive" &&
      body.equals(Buffer.from("archive"))
        ? "b".repeat(64)
        : "a".repeat(64),
    discoveryEdge:
      role === "main"
        ? ("submitted-entry" as const)
        : ("required-citation-information" as const),
    depth: 0,
    body,
  };
}

export function optionsWithArchive(options: {
  archive?: boolean;
  distinctArchive?: boolean;
}) {
  return options.archive || options.distinctArchive;
}

export function captureReport(
  budget: "standard" | "expanded",
  degraded = false,
) {
  return {
    budget,
    completeness: degraded ? ("partial" as const) : ("complete" as const),
    readingReadiness: degraded ? ("degraded" as const) : ("ready" as const),
    readinessReasons: degraded ? ["Component unavailable"] : [],
    unresolvedResources: degraded
      ? [
          {
            url: "https://plato.stanford.edu/private-value",
            parentIdentity: "active:/",
            role: "supplement" as const,
            depth: 1,
            reason: "private failure detail",
            limit: false,
          },
        ]
      : [],
    limits: {
      maxComponents: budget === "expanded" ? 128 : 64,
      maxAssets: budget === "expanded" ? 512 : 256,
      maxResourceBytes: budget === "expanded" ? 100_000_000 : 50_000_000,
      maxTotalBytes: budget === "expanded" ? 500_000_000 : 250_000_000,
      maxDepth: budget === "expanded" ? 16 : 8,
      maxRedirects: 5,
      timeoutMilliseconds: budget === "expanded" ? 30_000 : 15_000,
      maxConcurrency: 4,
    },
    retryUsed: budget === "expanded",
  };
}

export function storedPreview(
  record: SepAdmissionCreateRecord,
  existingUpdate?: "unchanged" | "changed",
): SepAdmissionStoredPreview {
  return {
    preview: {
      id: record.id,
      stableKey: record.stableKey,
      submittedUrl: record.submittedUrl,
      recommendedArchiveUrl: record.recommendedArchiveUrl ?? null,
      title: record.title,
      authors: record.authors,
      publisher: record.publisher,
      publicationHistory: record.publicationHistory,
      diagnostics: record.diagnostics,
      captureDiagnostics: record.captureReport,
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
      replacesSourceId: record.replacesSourceId ?? null,
      processingMilliseconds: record.processingMilliseconds,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    },
    resources: record.resources.map((item, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      previewId: record.id,
      ...item,
      charset: item.charset ?? null,
      contentEncoding: item.contentEncoding ?? null,
    })),
    existingStates: existingUpdate
      ? [
          {
            id: "30000000-0000-4000-8000-000000000000",
            observationKey: "submitted",
            resources: record.resources
              .filter(({ observationKey }) => observationKey === "submitted")
              .map(({ identity, sha256, byteLength }) => ({
                identity,
                sha256: existingUpdate === "changed" ? "f".repeat(64) : sha256,
                byteLength,
              })),
          },
        ]
      : [],
  };
}
