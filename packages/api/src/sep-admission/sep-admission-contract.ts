import type {
  sepAdmissionPreviews,
  sepPreviewResources,
} from "@lirna/db/schema/sep-admission";

import type { SepAdmissionObservation } from "./sep-admission-observation";
import type { SepAdmittedState } from "./sep-admitted-state";
import type {
  CapturedSepResource,
  SepCaptureReport,
  SepDiagnostic,
  SepObservationKey,
} from "./sep-capture";

export interface SepAdmissionPreview {
  id: string;
  stableKey: string;
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
  update?: {
    sourceId: string;
    observations: Array<{
      key: SepObservationKey;
      result: "unchanged" | "changed" | "new";
      comparedStateId?: string;
    }>;
  };
}

export interface SepAdmissionResult {
  sourceId: string;
  states: SepAdmittedState[];
  outcomes: Array<{
    observationKey: SepObservationKey;
    stateId: string;
    disposition: "created" | "unchanged";
  }>;
}

export interface SepAdmissionStoredPreview {
  preview: typeof sepAdmissionPreviews.$inferSelect;
  resources: Array<typeof sepPreviewResources.$inferSelect>;
  existingStates: Array<{
    id: string;
    observationKey: SepObservationKey;
    resources: Array<{ identity: string; sha256: string; byteLength: number }>;
  }>;
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
  replacesSourceId?: string;
}

export interface SepAdmissionStore {
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
  getUpdateTarget(
    sourceId: string,
  ): Promise<{ stableKey: string; canonicalUrl: string } | undefined>;
  admit(
    id: string,
    observationKeys: SepObservationKey[],
    now: Date,
    onStage?: (
      stage: "database_persistence" | "reading_derivative_parsing",
    ) => void,
  ): Promise<SepAdmissionResult | undefined>;
}

export interface SepAdmissionOperations {
  submit(
    url: string,
    observation?: SepAdmissionObservation,
    replacesSourceId?: string,
  ): Promise<SepAdmissionPreview>;
  get(id: string): Promise<SepAdmissionPreview | undefined>;
  extend(id: string): Promise<SepAdmissionPreview | undefined>;
  delete(id: string): Promise<boolean>;
  retry(
    id: string,
    observation?: SepAdmissionObservation,
  ): Promise<SepAdmissionPreview | undefined>;
  admit(
    id: string,
    observationKeys: SepObservationKey[],
    observation?: SepAdmissionObservation,
  ): Promise<SepAdmissionResult | undefined>;
  checkUpdate(
    sourceId: string,
    observation?: SepAdmissionObservation,
  ): Promise<SepAdmissionPreview | undefined>;
}
