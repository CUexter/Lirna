import {
  createSepAdmissionOperations,
  type SepAdmissionCreateRecord,
  type SepAdmissionStore,
  type SepAdmissionStoredPreview,
} from "../sep-admission";
import type { SepCaptureClient } from "../sep-capture";

export function createHarness(
  options: {
    failExpandedCapture?: boolean;
    archive?: boolean;
    distinctArchive?: boolean;
  } = {},
) {
  let currentTime = new Date("2026-08-17T12:00:00.000Z");
  let record: SepAdmissionCreateRecord | undefined;
  let captureCount = 0;
  let admittedSelection: string[] | undefined;
  let admittedResult: Awaited<ReturnType<SepAdmissionStore["admit"]>>;
  const store: SepAdmissionStore = {
    async create(value) {
      record = structuredClone(value);
    },
    async getActive(id, now) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return undefined;
      }
      return storedPreview(record);
    },
    async extendActive(id, now, expiresAt) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return false;
      }
      record.expiresAt = expiresAt;
      return true;
    },
    async delete(id) {
      if (!record || record.id !== id) {
        return false;
      }
      record = undefined;
      return true;
    },
    async deleteExpired(now) {
      if (record && record.expiresAt <= now) {
        record = undefined;
        return 1;
      }
      return 0;
    },
    async claimExpandedRetry(id, now) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return "unavailable";
      }
      if (record.captureReport.retryUsed) {
        return "already-used";
      }
      record.captureReport.retryUsed = true;
      return "claimed";
    },
    async replaceCapture(id, now, value) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return "unavailable";
      }
      record = {
        id: record.id,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        ...structuredClone(value),
      };
      return "updated";
    },
    async admit(id, observationKeys, now) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return undefined;
      }
      if (admittedSelection) {
        if (
          [...admittedSelection].sort().join() !==
          [...observationKeys].sort().join()
        ) {
          throw new Error("different observation selection");
        }
        return admittedResult;
      }
      admittedSelection = observationKeys;
      admittedResult = {
        sourceId: "10000000-0000-4000-8000-000000000000",
        states: observationKeys.map((observationKey, sequence) => ({
          id: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
          sourceId: "10000000-0000-4000-8000-000000000000",
          sequence,
          observationKey,
          canonicalUrl: record?.submittedUrl ?? "",
          title: record?.title ?? "",
          authors: record?.authors ?? [],
          publisher: record?.publisher ?? "",
          publicationHistory: record?.publicationHistory ?? [],
          admittedAt: now.toISOString(),
          resources: (record?.resources ?? [])
            .filter((item) => item.observationKey === observationKey)
            .map((item) => ({
              role: item.role,
              requestedUrl: item.requestedUrl,
              finalUrl: item.finalUrl,
              mediaType: item.mediaType,
              byteLength: item.byteLength,
              sha256: item.sha256,
              discoveryEdge: item.discoveryEdge,
            })),
        })),
      };
      return admittedResult;
    },
  };
  const capture: SepCaptureClient = {
    async capture(url, budget = "standard") {
      captureCount += 1;
      if (budget === "expanded" && options.failExpandedCapture) {
        throw new Error("controlled expanded capture failure");
      }
      return {
        stableKey: "sep:logic",
        submittedUrl: url,
        title: "Logic",
        authors: ["Alice Example"],
        publisher: "Metaphysics Research Lab, Stanford University",
        publicationHistory: ["First published 2024"],
        diagnostics: [],
        captureReport: captureReport(budget),
        processingMilliseconds: 12,
        resources: optionsWithArchive(options)
          ? [
              resource("main", Buffer.from("main")),
              resource("citation-information", Buffer.from("citation")),
              resource(
                "main",
                Buffer.from(options.distinctArchive ? "archive" : "main"),
                "recommended-archive",
              ),
            ]
          : [
              resource("main", Buffer.from("main")),
              resource("citation-information", Buffer.from("citation")),
            ],
        ...(optionsWithArchive(options)
          ? {
              recommendedArchiveUrl:
                "https://plato.stanford.edu/archives/sum2026/entries/logic/",
            }
          : {}),
      };
    },
  };
  return {
    operations: createSepAdmissionOperations({
      store,
      capture,
      now: () => currentTime,
    }),
    getRecord: () => record,
    getCaptureCount: () => captureCount,
    setTime: (value: string) => {
      currentTime = new Date(value);
    },
  };
}

function resource(
  role: "main" | "citation-information",
  body: Buffer,
  observationKey: "submitted" | "recommended-archive" = "submitted",
) {
  const transfer = {
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
  };
  return {
    observationKey,
    identity:
      role === "main"
        ? `${observationKey === "submitted" ? "active" : "sum2026"}:/`
        : "citation-information:logic",
    role,
    ...transfer,
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

function optionsWithArchive(options: {
  archive?: boolean;
  distinctArchive?: boolean;
}) {
  return options.archive || options.distinctArchive;
}

function captureReport(budget: "standard" | "expanded") {
  return {
    budget,
    completeness: "complete" as const,
    readingReadiness: "ready" as const,
    readinessReasons: [],
    unresolvedResources: [],
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

function storedPreview(
  record: SepAdmissionCreateRecord,
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
      replacesSourceId: null,
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
  };
}
