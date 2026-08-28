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
import type { ReadingPositionOperations } from "./reading-position/reading-position-contract";
import { DrizzleReadingPositionStore } from "./reading-position/reading-position-store";
import type { ReadingWorkspaceOperations } from "./reading-workspace/reading-workspace";
import { createReadingWorkspaceReader } from "./reading-workspace/reading-workspace-reader";
import {
  createOpenRouterResearchAssistant,
  type ResearchAssistantOperations,
} from "./research-assistant/research-assistant";
import type { ActiveReadingDerivativeOperations } from "./sep-admission/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "./sep-admission/active-reading-derivative-store";
import type { SepAdmissionOperations } from "./sep-admission/sep-admission";
import { createDrizzleSepAdmissionOperations } from "./sep-admission/sep-admission-store";
import type { SepAdmittedStateOperations } from "./sep-admission/sep-admitted-state";
import { createSepAdmittedStateReader } from "./sep-admission/sep-admitted-state-reader";

export type ApplicationAdapters = {
  sepAdmissions?: SepAdmissionOperations;
  admittedSourceStates?: SepAdmittedStateOperations;
  annotations?: Application["annotations"];
  citationResolutions?: CitationResolutionOperations;
  citationInference?: CitationInferenceOperations | null;
  readingPositions?: ReadingPositionOperations;
  readingWorkspaces?: ReadingWorkspaceOperations;
  researchAssistant?: ResearchAssistantOperations | null;
  derivativeUpdates?: DerivativeUpdateOperations;
  activeReadingDerivatives?: ActiveReadingDerivativeOperations;
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
      ? productionResearchAssistant()
      : adapters.researchAssistant;
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
    derivativeUpdates:
      adapters.derivativeUpdates ?? new DrizzleDerivativeUpdateStore(db),
    activeReadingDerivatives,
    ...(researchAssistant ? { researchAssistant } : {}),
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

function productionResearchAssistant() {
  return env.OPENROUTER_API_KEY
    ? createOpenRouterResearchAssistant({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
      })
    : undefined;
}
