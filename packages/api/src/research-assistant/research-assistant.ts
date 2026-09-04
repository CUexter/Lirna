import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, UIMessageChunk } from "ai";
import { observeQuietly } from "../observation";
import type { ActiveReadingDerivativeOperations } from "../sep-admission/state/active-reading-derivative";
import {
  decideContentProcessing,
  type ProcessingEndpointClass,
} from "../source-handling-policy/source-handling-policy";
import type { EvidenceResolutionObservation } from "./evidence-resolution";
import { createNativeResearchAnswerAttempts } from "./native-research-answer-attempt";
import type { ResearchAnswerAttemptOperations } from "./research-answer-attempt";
import { createResearchAnswerAttemptSession } from "./research-answer-attempt-evidence";
import type { PersistResearchAnswer } from "./research-answer-finalization";
import {
  activeEvidenceContext,
  researchHistoryMessages,
  researchUserPrompt,
} from "./research-assistant-context";
import {
  defaultResearchAssistantModel,
  type ResearchAssistantModel,
} from "./research-assistant-contract";
import {
  defaultResearchEvidenceBudget,
  type ResearchEvidenceBudget,
  type ResearchEvidenceDecisionReceipt,
  type ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";

export interface ResearchAssistantInput {
  attachments?: Array<{
    data: URL;
    filename: string;
    mediaType: string;
  }>;
  question: string;
  model?: ResearchAssistantModel;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
    selectedText?: string;
  }>;
  sourceTitle: string;
  sourceId: string;
  sourceStateId: string;
  derivativeId?: string;
  componentIdentity: string;
  componentLabel: string;
  selectedText?: string;
  sourceText: string;
  components: Array<
    Pick<
      import("../sep-admission/reading/contract").ReadingComponent,
      "identity" | "label" | "plainText" | "role"
    >
  >;
}

export interface ResearchAssistantOperations {
  answer(
    input: ResearchAssistantInput,
    options?: ResearchAssistantAnswerOptions,
  ): Promise<ReadableStream<UIMessageChunk>>;
}

export interface ResearchAssistantAnswerOptions {
  onError?: (error: unknown) => string;
  onEvidenceResolution?: (observation: EvidenceResolutionObservation) => void;
  onEvidenceSessionUpdate?: (snapshot: ResearchEvidenceSessionSnapshot) => void;
  onEvidenceSessionReceipt?: (
    receipt: ResearchEvidenceDecisionReceipt,
  ) => void | Promise<void>;
  commit?: {
    answerMessageId: string;
    questionMessageId: string;
    researchThreadId: string;
    persist: PersistResearchAnswer;
  };
}

interface ResearchAssistantConfiguration {
  evidenceBudget?: ResearchEvidenceBudget;
  processingEndpointClass?: ProcessingEndpointClass;
}

export function createResearchAssistant(
  answerAttempts: ResearchAnswerAttemptOperations<UIMessageChunk>,
  activeReadingDerivatives?: Pick<ActiveReadingDerivativeOperations, "read">,
  configuration: ResearchAssistantConfiguration = {},
): ResearchAssistantOperations {
  return {
    async answer(input, options) {
      const {
        derivativeId,
        evidenceComponents,
        policy,
        selectedText,
        sourceText,
      } = await activeEvidenceContext(input, activeReadingDerivatives);
      const { evidence, session: evidenceSession } =
        createResearchAnswerAttemptSession({
          components: evidenceComponents,
          sourceStateId: input.sourceStateId,
          derivativeId,
          currentDerivativeId: activeReadingDerivatives
            ? async () => {
                const active = await activeReadingDerivatives.read({
                  sourceId: input.sourceId,
                  stateId: input.sourceStateId,
                });
                return active.status === "active"
                  ? active.value.derivativeId
                  : undefined;
              }
            : async () => derivativeId,
          observe: options?.onEvidenceResolution,
          update: options?.onEvidenceSessionUpdate,
          budget: configuration.evidenceBudget,
          processingAllowed:
            !policy ||
            decideContentProcessing(
              policy,
              configuration.processingEndpointClass ?? "ordinary-cloud",
            ).allowed,
        });
      const prompt = researchUserPrompt(
        input,
        evidenceComponents,
        sourceText,
        selectedText,
      );
      observeQuietly(() =>
        options?.onEvidenceSessionUpdate?.(evidenceSession.snapshot()),
      );
      const maximumModelSteps =
        configuration.evidenceBudget?.maximumModelSteps ??
        defaultResearchEvidenceBudget.maximumModelSteps;
      const attemptInput = {
        prompt,
        history: researchHistoryMessages(input.history, evidenceComponents),
        attachments: input.attachments ?? [],
        model: input.model ?? defaultResearchAssistantModel,
        maximumModelSteps,
        evidence,
        onError: options?.onError,
      };
      return evidenceSession.run(() => answerAttempts.start(attemptInput), {
        commit: options?.commit,
        onError: options?.onError,
        onReceipt: options?.onEvidenceSessionReceipt,
        repair: (problems) =>
          answerAttempts.repair({
            prompt,
            problems,
            model: attemptInput.model,
            evidence,
            onError: options?.onError,
          }),
      });
    },
  };
}

export function createNativeResearchAssistant(
  model: LanguageModel | ((model: ResearchAssistantModel) => LanguageModel),
  activeReadingDerivatives?: Pick<ActiveReadingDerivativeOperations, "read">,
  configuration: ResearchAssistantConfiguration = {},
) {
  return createResearchAssistant(
    createNativeResearchAnswerAttempts(model),
    activeReadingDerivatives,
    configuration,
  );
}

export function createOpenRouterResearchAssistant({
  apiKey,
  activeReadingDerivatives,
}: {
  apiKey: string;
  activeReadingDerivatives: Pick<ActiveReadingDerivativeOperations, "read">;
}): ResearchAssistantOperations {
  const openrouter = createOpenRouter({ apiKey });
  return createNativeResearchAssistant(
    (model) => openrouter.chat(model),
    activeReadingDerivatives,
    { processingEndpointClass: "ordinary-cloud" },
  );
}
