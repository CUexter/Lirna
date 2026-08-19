// biome-ignore lint/style/noExcessiveLinesPerFile: Preview orchestration and exact-byte admission form one cohesive application boundary.
import { randomUUID } from "node:crypto";
import type {
  sepAdmissionPreviews,
  sepPreviewResources,
} from "@lirna/db/schema/sep-admission";
import { z } from "zod";

import {
  type CapturedSepResource,
  SepAdmissionError,
  type SepCaptureClient,
  type SepCaptureReport,
  type SepDiagnostic,
  type SepObservationKey,
} from "./sep-capture";
import type { SepReadingContract } from "./sep-reading-contract";

const previewLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const diagnosticSchema = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
});
const captureReportSchema = z.object({
  budget: z.enum(["standard", "expanded"]),
  completeness: z.enum(["complete", "partial", "stopped"]),
  readingReadiness: z.enum(["ready", "degraded"]),
  readinessReasons: z.array(z.string()),
  unresolvedResources: z.array(
    z.object({
      url: z.string(),
      parentIdentity: z.string(),
      role: z.enum([
        "supplement",
        "notes",
        "figure-description",
        "unknown-component",
        "semantic-asset",
      ]),
      depth: z.number().int().nonnegative(),
      reason: z.string(),
      limit: z.boolean(),
    }),
  ),
  limits: z.object({
    maxComponents: z.number().int().positive(),
    maxAssets: z.number().int().positive(),
    maxResourceBytes: z.number().int().positive(),
    maxTotalBytes: z.number().int().positive(),
    maxDepth: z.number().int().positive(),
    maxRedirects: z.number().int().positive(),
    timeoutMilliseconds: z.number().int().positive(),
    maxConcurrency: z.number().int().positive(),
  }),
  retryUsed: z.boolean(),
});

export interface SepAdmissionPreview {
  id: string;
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  submittedUrl: string;
  recommendedArchiveUrl?: string;
  policy: {
    rightsBasis: "publicly-accessible";
    sensitivityLevel: "ordinary-cloud";
  };
  metrics: {
    requests: number;
    downloadedBytes: number;
    retainedBytes: number;
    processingMilliseconds: number;
  };
  createdAt: string;
  expiresAt: string;
  diagnostics: SepDiagnostic[];
  capture: SepCaptureReport & { retryAvailable: boolean };
  resources: Array<{
    observationKey: SepObservationKey;
    identity: string;
    role: CapturedSepResource["role"];
    requestedUrl: string;
    finalUrl: string;
    status: number;
    mediaType: string;
    charset?: string;
    contentEncoding?: string;
    selectedHeaders: Record<string, string>;
    requestCount: number;
    downloadedBytes: number;
    retrievedAt: string;
    byteLength: number;
    sha256: string;
    discoveryEdge: string;
    depth: number;
  }>;
  observations: Array<{
    key: SepObservationKey;
    label: "Active" | "Recommended archive";
    canonicalUrl: string;
    resources: SepAdmissionPreview["resources"];
  }>;
  comparison: {
    result: "equivalent" | "distinct" | "active-only";
    message: string;
  };
}

export interface SepAdmittedState {
  id: string;
  sourceId: string;
  sequence: number;
  observationKey: SepObservationKey;
  canonicalUrl: string;
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  admittedAt: string;
  resources: Array<{
    role: CapturedSepResource["role"];
    requestedUrl: string;
    finalUrl: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
    discoveryEdge: string;
  }>;
}

export interface SepAdmissionResult {
  sourceId: string;
  states: SepAdmittedState[];
}

export interface SepAdmissionStoredPreview {
  preview: typeof sepAdmissionPreviews.$inferSelect;
  resources: Array<typeof sepPreviewResources.$inferSelect>;
}

export interface SepAdmissionCreateRecord {
  id: string;
  stableKey: string;
  submittedUrl: string;
  recommendedArchiveUrl?: string;
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  diagnostics: SepDiagnostic[];
  captureReport: SepCaptureReport;
  processingMilliseconds: number;
  createdAt: Date;
  expiresAt: Date;
  resources: CapturedSepResource[];
}

export interface SepAdmittedStateReader {
  getState(
    sourceId: string,
    stateId: string,
  ): Promise<SepAdmittedState | undefined>;
  getReading(
    sourceId: string,
    stateId: string,
  ): Promise<SepReadingContract | undefined>;
}

export interface SepAdmissionStore extends SepAdmittedStateReader {
  create(record: SepAdmissionCreateRecord): Promise<void>;
  getActive(
    id: string,
    now: Date,
  ): Promise<SepAdmissionStoredPreview | undefined>;
  extendActive(id: string, now: Date, expiresAt: Date): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  deleteExpired(now: Date): Promise<number>;
  claimExpandedRetry(
    id: string,
    now: Date,
  ): Promise<"claimed" | "unavailable" | "already-used">;
  replaceCapture(
    id: string,
    now: Date,
    record: Omit<SepAdmissionCreateRecord, "id" | "createdAt" | "expiresAt">,
  ): Promise<"updated" | "unavailable">;
  admit(
    id: string,
    observationKeys: SepObservationKey[],
    now: Date,
  ): Promise<SepAdmissionResult | undefined>;
}

export interface SepAdmissionOperations extends SepAdmittedStateReader {
  submit(url: string): Promise<SepAdmissionPreview>;
  get(id: string): Promise<SepAdmissionPreview | undefined>;
  extend(id: string): Promise<SepAdmissionPreview | undefined>;
  delete(id: string): Promise<boolean>;
  retry(id: string): Promise<SepAdmissionPreview | undefined>;
  admit(
    id: string,
    observationKeys: SepObservationKey[],
  ): Promise<SepAdmissionResult | undefined>;
}

export function createSepAdmissionOperations(options: {
  store: SepAdmissionStore;
  capture: SepCaptureClient;
  now?: () => Date;
}): SepAdmissionOperations {
  const now = options.now ?? (() => new Date());

  async function read(id: string): Promise<SepAdmissionPreview | undefined> {
    const readAt = now();
    await options.store.deleteExpired(readAt);
    const stored = await options.store.getActive(id, readAt);
    return stored ? toPreview(stored) : undefined;
  }

  return {
    async submit(url) {
      const createdAt = now();
      await options.store.deleteExpired(createdAt);
      const captured = await options.capture.capture(url);
      const id = randomUUID();
      await options.store.create({
        id,
        ...captured,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + previewLifetimeMilliseconds),
      });
      const preview = await read(id);
      if (!preview) {
        throw new Error(
          `SEP Admission preview ${id} vanished after persistence`,
        );
      }
      return preview;
    },
    get: read,
    async extend(id) {
      const extendedAt = now();
      await options.store.deleteExpired(extendedAt);
      const updated = await options.store.extendActive(
        id,
        extendedAt,
        new Date(extendedAt.getTime() + previewLifetimeMilliseconds),
      );
      return updated ? read(id) : undefined;
    },
    delete: (id) => options.store.delete(id),
    async retry(id) {
      const retriedAt = now();
      await options.store.deleteExpired(retriedAt);
      const claim = await options.store.claimExpandedRetry(id, retriedAt);
      if (claim === "unavailable") {
        return undefined;
      }
      if (claim === "already-used") {
        throw new SepAdmissionError(
          "The expanded capture budget has already been used for this preview",
        );
      }
      const existing = await options.store.getActive(id, retriedAt);
      if (!existing) {
        return undefined;
      }
      const captured = await options.capture.capture(
        existing.preview.submittedUrl,
        "expanded",
      );
      const result = await options.store.replaceCapture(
        id,
        retriedAt,
        captured,
      );
      return result === "updated" ? read(id) : undefined;
    },
    async admit(id, observationKeys) {
      if (observationKeys.length === 0) {
        throw new SepAdmissionError("Select at least one observation to admit");
      }
      if (new Set(observationKeys).size !== observationKeys.length) {
        throw new SepAdmissionError(
          "Each observation may be selected only once",
        );
      }
      const admittedAt = now();
      await options.store.deleteExpired(admittedAt);
      return options.store.admit(id, observationKeys, admittedAt);
    },
    getState: (sourceId, stateId) => options.store.getState(sourceId, stateId),
    getReading: (sourceId, stateId) =>
      options.store.getReading(sourceId, stateId),
  };
}

function toPreview({
  preview,
  resources,
}: SepAdmissionStoredPreview): SepAdmissionPreview {
  const authors = z.array(z.string()).parse(preview.authors);
  const publicationHistory = z
    .array(z.string())
    .parse(preview.publicationHistory);
  const diagnostics = z.array(diagnosticSchema).parse(preview.diagnostics);
  const captureReport = captureReportSchema.parse(preview.captureDiagnostics);
  const typedResources = resources.map((resource) => {
    const role = z
      .enum([
        "main",
        "citation-information",
        "supplement",
        "notes",
        "figure-description",
        "unknown-component",
        "semantic-asset",
      ])
      .parse(resource.role);
    return {
      observationKey: z
        .enum(["submitted", "recommended-archive"])
        .parse(resource.observationKey),
      identity: resource.identity,
      role,
      requestedUrl: resource.requestedUrl,
      finalUrl: resource.finalUrl,
      status: resource.status,
      mediaType: resource.mediaType,
      charset: resource.charset ?? undefined,
      contentEncoding: resource.contentEncoding ?? undefined,
      selectedHeaders: z
        .record(z.string(), z.string())
        .parse(resource.selectedHeaders),
      requestCount: resource.requestCount,
      downloadedBytes: resource.downloadedBytes,
      retrievedAt: resource.retrievedAt.toISOString(),
      byteLength: resource.byteLength,
      sha256: resource.sha256,
      discoveryEdge: resource.discoveryEdge,
      depth: resource.depth,
    };
  });
  if (!typedResources.some((resource) => resource.role === "main")) {
    throw new Error(
      `SEP Admission preview ${preview.id} is missing its main entry`,
    );
  }
  if (
    !typedResources.some((resource) => resource.role === "citation-information")
  ) {
    throw new Error(
      `SEP Admission preview ${preview.id} is missing citation information`,
    );
  }
  const activeResources = typedResources.filter(
    (resource) => resource.observationKey === "submitted",
  );
  const archiveResources = typedResources.filter(
    (resource) => resource.observationKey === "recommended-archive",
  );
  const observations: SepAdmissionPreview["observations"] = [
    {
      key: "submitted",
      label: "Active",
      canonicalUrl:
        activeResources.find((resource) => resource.role === "main")
          ?.requestedUrl ?? preview.submittedUrl,
      resources: activeResources,
    },
    ...(archiveResources.length > 0
      ? [
          {
            key: "recommended-archive" as const,
            label: "Recommended archive" as const,
            canonicalUrl:
              archiveResources.find((resource) => resource.role === "main")
                ?.requestedUrl ??
              preview.recommendedArchiveUrl ??
              "",
            resources: archiveResources,
          },
        ]
      : []),
  ];
  return {
    id: preview.id,
    title: preview.title,
    authors,
    publisher: preview.publisher,
    publicationHistory,
    submittedUrl: preview.submittedUrl,
    recommendedArchiveUrl: preview.recommendedArchiveUrl ?? undefined,
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    },
    metrics: {
      requests: resources.reduce(
        (total, resource) => total + resource.requestCount,
        0,
      ),
      downloadedBytes: resources.reduce(
        (total, resource) => total + resource.downloadedBytes,
        0,
      ),
      retainedBytes: resources.reduce(
        (total, resource) => total + resource.body.byteLength,
        0,
      ),
      processingMilliseconds: preview.processingMilliseconds,
    },
    createdAt: preview.createdAt.toISOString(),
    expiresAt: preview.expiresAt.toISOString(),
    diagnostics,
    capture: {
      ...captureReport,
      retryAvailable: !captureReport.retryUsed,
    },
    resources: typedResources,
    observations,
    comparison: compareObservations(activeResources, archiveResources),
  };
}

function compareObservations(
  active: SepAdmissionPreview["resources"],
  archive: SepAdmissionPreview["resources"],
): SepAdmissionPreview["comparison"] {
  if (archive.length === 0) {
    return {
      result: "active-only",
      message: "No recommended archived observation was available to compare.",
    };
  }
  const manifest = (resources: SepAdmissionPreview["resources"]) =>
    resources
      .filter((resource) => resource.role !== "citation-information")
      .map((resource) => ({
        identity: resource.identity.slice(resource.identity.indexOf(":")),
        role: resource.role,
        byteLength: resource.byteLength,
        sha256: resource.sha256,
      }))
      .sort((left, right) => left.identity.localeCompare(right.identity));
  const equivalent =
    JSON.stringify(manifest(active)) === JSON.stringify(manifest(archive));
  return equivalent
    ? {
        result: "equivalent",
        message:
          "Active and recommended archive publication resources are byte-equivalent; their provenance remains separate.",
      }
    : {
        result: "distinct",
        message:
          "Active and recommended archive publication resources are materially distinct.",
      };
}
