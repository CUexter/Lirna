import { randomUUID } from "node:crypto";
import type {
  sepAdmissionPreviews,
  sepPreviewResources,
} from "@lirna/db/schema/sep-admission";

import { toSepAdmissionPreview } from "./sep-admission-preview";
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
  listSources(): Promise<SepLibrarySource[]>;
  getState(
    sourceId: string,
    stateId: string,
  ): Promise<SepAdmittedState | undefined>;
  getReading(
    sourceId: string,
    stateId: string,
  ): Promise<SepReadingContract | undefined>;
}

export interface SepLibrarySource {
  id: string;
  title: string;
  admittedAt: string;
  states: Array<
    Pick<
      SepAdmittedState,
      "id" | "sequence" | "observationKey" | "canonicalUrl" | "admittedAt"
    >
  >;
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
    return stored ? toSepAdmissionPreview(stored) : undefined;
  }

  return {
    listSources: () => options.store.listSources(),
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
