import type {
  DerivativeActivation,
  DerivativeComparison,
  DerivativeValidation,
  ReadingDerivativeCandidate,
} from "../derivative-updates/derivative-update-contract";
import type { SourceHandlingPolicy } from "../source-handling-policy/source-handling-policy";
import type {
  CapturedSepResource,
  SepCaptureReport,
  SepDiagnostic,
  SepObservationKey,
  SepUnresolvedResource,
} from "./sep-capture";
import type { SepReadingContract } from "./sep-reading-contract";

export interface SepDerivativeProvenance {
  id: string;
  kind: string;
  previousDerivativeId?: string;
  valid: boolean;
  generation: ReadingDerivativeCandidate["generation"];
  validation: DerivativeValidation;
  generationError?: string;
  comparison?: DerivativeComparison;
  createdAt: string;
  currentActivation?: DerivativeActivation;
  activationHistory: DerivativeActivation[];
  provenance?: SepReadingContract["provenance"];
}

interface SepHistoricalCaptureReport {
  budget: "unknown";
  completeness: "partial";
  readingReadiness: "degraded";
  readinessReasons: string[];
  unresolvedResources: SepUnresolvedResource[];
  limits: null;
  retryUsed: null;
}

export interface SepAdmittedResource {
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
  policy: SourceHandlingPolicy;
  diagnostics: SepDiagnostic[];
  capture: SepCaptureReport | SepHistoricalCaptureReport;
  resources: SepAdmittedResource[];
  components: Array<{
    identity: string;
    role: CapturedSepResource["role"];
    label: string;
    order: number;
    parentIdentity?: string;
    requestedUrl: string;
    finalUrl: string;
    retrievedAt: string;
    sha256: string;
  }>;
  derivatives: SepDerivativeProvenance[];
}

export interface SepLibrarySource {
  id: string;
  title: string;
  admittedAt: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  kind: "sep";
  stableKey?: string;
  currentStateId?: string;
  states: Array<
    Pick<
      SepAdmittedState,
      | "id"
      | "sequence"
      | "observationKey"
      | "canonicalUrl"
      | "title"
      | "publisher"
      | "admittedAt"
    >
  >;
}

export interface SepAdmittedStateOperations {
  listSources(): Promise<SepLibrarySource[]>;
  deleteSource(sourceId: string): Promise<boolean>;
  getState(
    sourceId: string,
    stateId: string,
  ): Promise<SepAdmittedState | undefined>;
  getReading(
    sourceId: string,
    stateId: string,
  ): Promise<SepReadingContract | undefined>;
  getUpdateTarget(
    sourceId: string,
  ): Promise<{ stableKey: string; canonicalUrl: string } | undefined>;
}
