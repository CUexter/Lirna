import {
  createSepAdmissionOperations,
  type SepAdmissionCreateRecord,
  type SepAdmissionStore,
} from "../admission/operations";
import type { SepCaptureClient } from "../capture/client";
import {
  captureReport,
  optionsWithArchive,
  resource,
  storedPreview,
} from "./operations-harness-data";

export function createHarness(
  options: {
    failExpandedCapture?: boolean;
    degradedCapture?: boolean;
    archive?: boolean;
    distinctArchive?: boolean;
    existingUpdate?: "unchanged" | "changed";
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
      return storedPreview(record, options.existingUpdate);
    },
    async extendActive(id, now, expiresAt) {
      if (!record || record.id !== id || record.expiresAt <= now) return false;
      record.expiresAt = expiresAt;
      return true;
    },
    async delete(id) {
      if (!record || record.id !== id) return false;
      record = undefined;
      return true;
    },
    async deleteExpired(now) {
      if (!record || record.expiresAt > now) return 0;
      record = undefined;
      return 1;
    },
    async claimExpandedRetry(id, now) {
      if (!record || record.id !== id || record.expiresAt <= now) {
        return "unavailable";
      }
      if (record.captureReport.retryUsed) return "already-used";
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
    async getUpdateTarget() {
      return {
        stableKey: "sep:logic",
        canonicalUrl: "https://plato.stanford.edu/entries/logic/",
      };
    },
    async admit(id, observationKeys, now, onStage) {
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
      onStage?.("reading_derivative_parsing");
      onStage?.("database_persistence");
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
          policy: {
            rightsBasis: "publicly-accessible",
            sensitivityLevel: "ordinary-cloud",
          },
          diagnostics: record?.diagnostics ?? [],
          capture: record?.captureReport ?? captureReport("standard"),
          resources: (record?.resources ?? [])
            .filter((item) => item.observationKey === observationKey)
            .map((item) => ({
              identity: item.identity,
              role: item.role,
              requestedUrl: item.requestedUrl,
              finalUrl: item.finalUrl,
              status: item.status,
              mediaType: item.mediaType,
              charset: item.charset,
              contentEncoding: item.contentEncoding,
              selectedHeaders: item.selectedHeaders,
              requestCount: item.requestCount,
              downloadedBytes: item.downloadedBytes,
              retrievedAt: item.retrievedAt.toISOString(),
              byteLength: item.byteLength,
              sha256: item.sha256,
              discoveryEdge: item.discoveryEdge,
              depth: item.depth,
            })),
          components: [],
          derivatives: [],
        })),
        outcomes: observationKeys.map((observationKey, sequence) => ({
          observationKey,
          stateId: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
          disposition: "created" as const,
        })),
      };
      return admittedResult;
    },
  };
  const capture: SepCaptureClient = {
    async capture(url, budget, onStage) {
      const captureBudget = budget ?? "standard";
      captureCount += 1;
      onStage?.("validation");
      onStage?.("mandatory_download");
      if (captureBudget === "expanded" && options.failExpandedCapture) {
        throw new Error("controlled expanded capture failure");
      }
      onStage?.("metadata_parsing");
      onStage?.("optional_bundle_capture");
      return {
        stableKey: "sep:logic",
        submittedUrl: url,
        title: "Logic",
        authors: ["Alice Example"],
        publisher: "Metaphysics Research Lab, Stanford University",
        publicationHistory: ["First published 2024"],
        diagnostics: [],
        captureReport: captureReport(captureBudget, options.degradedCapture),
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
