import type { AnnotationOperations } from "./annotations/annotation-contract";
import type {
  CitationInferenceOperations,
  CitationResolutionOperations,
} from "./citation-resolutions/citation-resolution-contract";
import type { DerivativeUpdateOperations } from "./derivative-updates/derivative-update-contract";
import type { RequestObservation } from "./observation";
import type { OfflineWorkingSetOperations } from "./offline-working-set/offline-working-set-capture";
import type { ReadingPositionOperations } from "./reading-position/reading-position-contract";
import type { ReadingWorkspaceOperations } from "./reading-workspace/reading-workspace";
import type { ResearchEvidenceReceiptOperations } from "./research-assistant/research-evidence-receipt-store";
import type { ResearchThreadOperations } from "./research-assistant/research-thread-contract";
import type { ResearchTurnOperations } from "./research-assistant/research-turn";
import type { SepAdmissionOperations } from "./sep-admission/admission/operations";
import type { ActiveReadingDerivativeOperations } from "./sep-admission/state/active-reading-derivative";
import type { SepAdmittedStateOperations } from "./sep-admission/state/admitted-state";

export interface Application {
  sepAdmissions: SepAdmissionOperations;
  admittedSourceStates: SepAdmittedStateOperations;
  annotations: AnnotationOperations;
  citationResolutions: CitationResolutionOperations;
  citationInference?: CitationInferenceOperations;
  readingPositions: ReadingPositionOperations;
  readingWorkspaces: ReadingWorkspaceOperations;
  researchTurns?: ResearchTurnOperations;
  researchThreads: ResearchThreadOperations;
  researchEvidenceReceipts?: ResearchEvidenceReceiptOperations;
  derivativeUpdates: DerivativeUpdateOperations;
  activeReadingDerivatives: ActiveReadingDerivativeOperations;
  offlineWorkingSets: OfflineWorkingSetOperations;
}

export type CreateContextOptions = {
  application: Application;
  observation?: RequestObservation;
  debugErrors?: boolean;
};

export function createContext({
  application,
  observation,
  debugErrors,
}: CreateContextOptions) {
  return {
    ...application,
    ...(observation ? { observation } : {}),
    ...(debugErrors === undefined ? {} : { debugErrors }),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
