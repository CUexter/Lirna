import { db } from "@lirna/db";
import { env } from "@lirna/env/server";
import { DrizzleAnnotationStore } from "./annotations/annotation-store";
import { createOpenRouterCitationInference } from "./citation-resolutions/citation-inference";
import type {
  CitationInferenceOperations,
  CitationResolutionOperations,
} from "./citation-resolutions/citation-resolution-contract";
import { DrizzleCitationResolutionStore } from "./citation-resolutions/citation-resolution-store";
import type { Application } from "./context";
import type { DerivativeUpdateOperations } from "./derivative-updates/derivative-update-contract";
import { DrizzleDerivativeUpdateStore } from "./derivative-updates/derivative-update-store";
import { createOfflineWorkingSetCapture } from "./offline-working-set/offline-working-set-capture";
import type { ReadingPositionOperations } from "./reading-position/reading-position-contract";
import { DrizzleReadingPositionStore } from "./reading-position/reading-position-store";
import type { ReadingWorkspaceOperations } from "./reading-workspace/reading-workspace";
import { createReadingWorkspaceReader } from "./reading-workspace/reading-workspace-reader";
import {
  createOpenRouterResearchAssistant,
  type ResearchAssistantOperations,
} from "./research-assistant/research-assistant";
import type { ResearchThreadOperations } from "./research-assistant/research-thread-contract";
import { DrizzleResearchThreadStore } from "./research-assistant/research-thread-store";
import {
  createResearchTurnOperations,
  type ResearchTurnOperations,
} from "./research-assistant/research-turn";
import type { SepAdmissionOperations } from "./sep-admission/admission/operations";
import { createDrizzleSepAdmissionOperations } from "./sep-admission/admission/store";
import type { ActiveReadingDerivativeOperations } from "./sep-admission/state/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "./sep-admission/state/active-reading-derivative-store";
import type { SepAdmittedStateOperations } from "./sep-admission/state/admitted-state";
import { createSepAdmittedStateReader } from "./sep-admission/state/admitted-state-reader";

export type ApplicationAdapters = {
  sepAdmissions?: SepAdmissionOperations;
  admittedSourceStates?: SepAdmittedStateOperations;
  annotations?: Application["annotations"];
  citationResolutions?: CitationResolutionOperations;
  citationInference?: CitationInferenceOperations | null;
  readingPositions?: ReadingPositionOperations;
  readingWorkspaces?: ReadingWorkspaceOperations;
  researchAssistant?: ResearchAssistantOperations | null;
  researchTurns?: ResearchTurnOperations | null;
  researchThreads?: ResearchThreadOperations;
  derivativeUpdates?: DerivativeUpdateOperations;
  activeReadingDerivatives?: ActiveReadingDerivativeOperations;
  offlineWorkingSets?: Application["offlineWorkingSets"];
};

export function createApplication(
  adapters: ApplicationAdapters = {},
): Application {
  const activeReadingDerivatives =
    adapters.activeReadingDerivatives ??
    new DrizzleActiveReadingDerivativeStore(db);
  const citationInference =
    adapters.citationInference === undefined
      ? productionCitationInference()
      : adapters.citationInference;
  const researchAssistant =
    adapters.researchAssistant === undefined
      ? productionResearchAssistant(activeReadingDerivatives)
      : adapters.researchAssistant;
  const researchThreads =
    adapters.researchThreads ?? new DrizzleResearchThreadStore(db);
  const researchTurns = selectResearchTurns(
    adapters.researchTurns,
    researchAssistant,
    researchThreads,
  );
  return {
    sepAdmissions:
      adapters.sepAdmissions ?? createDrizzleSepAdmissionOperations(db),
    admittedSourceStates:
      adapters.admittedSourceStates ??
      createSepAdmittedStateReader(db, activeReadingDerivatives),
    annotations:
      adapters.annotations ??
      new DrizzleAnnotationStore(db, activeReadingDerivatives),
    citationResolutions:
      adapters.citationResolutions ??
      new DrizzleCitationResolutionStore(db, activeReadingDerivatives),
    ...(citationInference ? { citationInference } : {}),
    readingPositions:
      adapters.readingPositions ??
      new DrizzleReadingPositionStore(db, activeReadingDerivatives),
    readingWorkspaces:
      adapters.readingWorkspaces ?? createReadingWorkspaceReader(db),
    researchThreads,
    derivativeUpdates:
      adapters.derivativeUpdates ?? new DrizzleDerivativeUpdateStore(db),
    activeReadingDerivatives,
    offlineWorkingSets:
      adapters.offlineWorkingSets ?? createOfflineWorkingSetCapture(db),
    ...(researchTurns ? { researchTurns } : {}),
  };
}

export const productionApplication = createApplication();

function productionCitationInference() {
  return env.CITATION_INFERENCE_ENABLED && env.OPENROUTER_API_KEY
    ? createOpenRouterCitationInference({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
      })
    : undefined;
}

function productionResearchAssistant(
  activeReadingDerivatives: ActiveReadingDerivativeOperations,
) {
  return env.OPENROUTER_API_KEY
    ? createOpenRouterResearchAssistant({
        apiKey: env.OPENROUTER_API_KEY,
        activeReadingDerivatives,
      })
    : undefined;
}

function selectResearchTurns(
  configured: ResearchTurnOperations | null | undefined,
  assistant: ResearchAssistantOperations | null | undefined,
  threads: ResearchThreadOperations,
) {
  if (configured !== undefined) return configured ?? undefined;
  return assistant
    ? createResearchTurnOperations(assistant, threads)
    : undefined;
}
