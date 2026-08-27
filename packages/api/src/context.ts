import { db } from "@lirna/db";
import { env } from "@lirna/env/server";
import type { AnnotationOperations } from "./annotations/annotation-contract";
import { DrizzleAnnotationStore } from "./annotations/annotation-store";
import { createOpenRouterCitationInference } from "./citation-resolutions/citation-inference";
import type {
  CitationInferenceOperations,
  CitationResolutionOperations,
} from "./citation-resolutions/citation-resolution-contract";
import { DrizzleCitationResolutionStore } from "./citation-resolutions/citation-resolution-store";
import type { DerivativeUpdateOperations } from "./derivative-updates/derivative-update-contract";
import { DrizzleDerivativeUpdateStore } from "./derivative-updates/derivative-update-store";
import type { RequestObservation } from "./observation";
import type { ReadingPositionOperations } from "./reading-position/reading-position-contract";
import { DrizzleReadingPositionStore } from "./reading-position/reading-position-store";
import { createReadingWorkspaceReader } from "./reading-workspace/reading-workspace-reader";
import {
  createOpenRouterResearchAssistant,
  type ResearchAssistantOperations,
} from "./research-assistant/research-assistant";
import type { ActiveReadingDerivativeOperations } from "./sep-admission/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "./sep-admission/active-reading-derivative-store";
import type { SepAdmissionOperations } from "./sep-admission/sep-admission";
import { sepAdmissionOperations } from "./sep-admission/sep-admission-store";
import type { SepAdmittedStateOperations } from "./sep-admission/sep-admitted-state";
import { sepAdmittedStateOperations } from "./sep-admission/sep-admitted-state-reader";

export type CreateContextOptions = {
  sepAdmissions?: SepAdmissionOperations;
  admittedSourceStates?: SepAdmittedStateOperations;
  annotations?: AnnotationOperations;
  citationResolutions?: CitationResolutionOperations;
  citationInference?: CitationInferenceOperations;
  readingPositions?: ReadingPositionOperations;
  researchAssistant?: ResearchAssistantOperations;
  derivativeUpdates?: DerivativeUpdateOperations;
  activeReadingDerivatives?: ActiveReadingDerivativeOperations;
  observation?: RequestObservation;
  debugErrors?: boolean;
};

const activeReadingDerivativeStore = new DrizzleActiveReadingDerivativeStore(
  db,
);
const annotationStore = new DrizzleAnnotationStore(
  db,
  activeReadingDerivativeStore,
);
const citationResolutionStore = new DrizzleCitationResolutionStore(
  db,
  activeReadingDerivativeStore,
);
const citationInference =
  env.CITATION_INFERENCE_ENABLED && env.OPENROUTER_API_KEY
    ? createOpenRouterCitationInference({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
      })
    : undefined;
const readingPositionStore = new DrizzleReadingPositionStore(
  db,
  activeReadingDerivativeStore,
);
const readingWorkspaceOperations = createReadingWorkspaceReader(db);
const derivativeUpdateStore = new DrizzleDerivativeUpdateStore(db);
const researchAssistant = env.OPENROUTER_API_KEY
  ? createOpenRouterResearchAssistant({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL,
    })
  : undefined;

export function createContext({
  sepAdmissions,
  admittedSourceStates,
  annotations,
  citationResolutions,
  citationInference: citationInferenceOverride,
  readingPositions,
  researchAssistant: researchAssistantOverride,
  derivativeUpdates,
  activeReadingDerivatives,
  observation,
  debugErrors,
}: CreateContextOptions) {
  return {
    sepAdmissions: sepAdmissions ?? sepAdmissionOperations,
    admittedSourceStates: admittedSourceStates ?? sepAdmittedStateOperations,
    annotations: annotations ?? annotationStore,
    citationResolutions: citationResolutions ?? citationResolutionStore,
    ...((citationInferenceOverride ?? citationInference)
      ? { citationInference: citationInferenceOverride ?? citationInference }
      : {}),
    readingPositions: readingPositions ?? readingPositionStore,
    readingWorkspaces: readingWorkspaceOperations,
    derivativeUpdates: derivativeUpdates ?? derivativeUpdateStore,
    activeReadingDerivatives:
      activeReadingDerivatives ?? activeReadingDerivativeStore,
    ...((researchAssistantOverride ?? researchAssistant)
      ? { researchAssistant: researchAssistantOverride ?? researchAssistant }
      : {}),
    ...(observation ? { observation } : {}),
    ...(debugErrors === undefined ? {} : { debugErrors }),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
