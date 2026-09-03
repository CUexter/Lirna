import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  type LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { observeQuietly } from "../observation";
import type { ActiveReadingDerivativeOperations } from "../sep-admission/state/active-reading-derivative";
import {
  decideContentProcessing,
  type ProcessingEndpointClass,
} from "../source-handling-policy/source-handling-policy";
import type { EvidenceResolutionObservation } from "./evidence-resolution";
import type { PersistResearchAnswer } from "./research-answer-finalization";
import type { AnswerValidationProblem } from "./research-answer-ledger";
import {
  activeEvidenceContext,
  finalSynthesisInstruction,
  researchHistoryMessages,
  researchInstructions,
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
import { createResearchEvidenceSession } from "./research-evidence-tools";

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
  onEvidenceSessionReceipt?: (receipt: ResearchEvidenceDecisionReceipt) => void;
  commit?: {
    researchThreadId: string;
    persist: PersistResearchAnswer;
  };
}

interface ResearchAssistantConfiguration {
  evidenceBudget?: ResearchEvidenceBudget;
  processingEndpointClass?: ProcessingEndpointClass;
}

export function createResearchAssistant(
  model: LanguageModel | ((model: ResearchAssistantModel) => LanguageModel),
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
      const evidenceSession = createResearchEvidenceSession({
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
      const resolveModel = () =>
        typeof model === "function"
          ? model(input.model ?? defaultResearchAssistantModel)
          : model;
      const userMessage = () => ({
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          ...(input.attachments ?? []).map((attachment) => ({
            type: "file" as const,
            data: attachment.data,
            filename: attachment.filename,
            mediaType: attachment.mediaType,
          })),
        ],
      });
      const startModelStream = async () => {
        const agent = new ToolLoopAgent({
          model: resolveModel(),
          instructions: researchInstructions().join(" "),
          prepareStep: ({ instructions, stepNumber }) => {
            evidenceSession.beginModelStep(stepNumber);
            if (evidenceSession.hasValidAnswerLedger())
              return {
                instructions: `${instructions} ${finalSynthesisInstruction}`,
                toolChoice: "none",
              };
            const mustPrepareLedger =
              evidenceSession.snapshot().budgetExhausted ||
              stepNumber >= Math.max(0, maximumModelSteps - 3);
            if (mustPrepareLedger && evidenceSession.answerLedgerAttempts() < 2)
              return {
                instructions: `${instructions} Prepare the answer ledger now. Call prepareAnswer and no other tool. If a prior ledger was invalid, repair the reported structural problems.`,
                toolChoice: { type: "tool", toolName: "prepareAnswer" },
              };
            return mustPrepareLedger
              ? {
                  instructions: `${instructions} The answer ledger could not be validated within its repair budget. State that the answer could not be completed because its evidence structure remained invalid. Do not cite evidence or call tools.`,
                  toolChoice: "none",
                }
              : undefined;
          },
          stopWhen: stepCountIs(maximumModelSteps),
          tools: evidenceSession.tools,
        });
        const result = await agent.stream({
          messages: [
            ...researchHistoryMessages(input.history, evidenceComponents),
            userMessage(),
          ],
        });
        return toUIMessageStream({
          stream: result.stream,
          tools: evidenceSession.tools,
          sendReasoning: false,
          onError: options?.onError,
        });
      };
      return evidenceSession.run(startModelStream, {
        commit: options?.commit,
        onError: options?.onError,
        onReceipt: options?.onEvidenceSessionReceipt,
        repair: (problems: AnswerValidationProblem[]) =>
          repairFinalAnswer({
            evidenceSession,
            prompt,
            problems,
            model: resolveModel(),
            onError: options?.onError,
          }),
      });
    },
  };
}

async function repairFinalAnswer({
  evidenceSession,
  prompt,
  problems,
  model,
  onError,
}: {
  evidenceSession: ReturnType<typeof createResearchEvidenceSession>;
  prompt: string;
  problems: AnswerValidationProblem[];
  model: LanguageModel;
  onError?: (error: unknown) => string;
}) {
  const ledger = evidenceSession.validAnswerLedger();
  const agent = new ToolLoopAgent({
    model,
    instructions: [
      ...researchInstructions(),
      `Your previous final answer failed structural evidence validation: ${describeProblems(problems)}. Write a corrected final answer now in concise natural Markdown. Cover exactly the claims in this validated ledger: ${JSON.stringify(ledger)}. Preserve each declared claim text verbatim, place only declared alias and relation pairs immediately after the claim they ground, and use an empty :::quote[ev_1] then ::: block only when exact wording matters. Do not call or imitate tools.`,
    ].join(" "),
    prepareStep: ({ stepNumber }) => {
      evidenceSession.beginModelStep(stepNumber);
      return { toolChoice: "none" };
    },
    stopWhen: stepCountIs(1),
  });
  const result = await agent.stream({
    messages: [{ role: "user", content: prompt }],
  });
  return toUIMessageStream({
    stream: result.stream,
    sendReasoning: false,
    onError,
  });
}

function describeProblems(problems: AnswerValidationProblem[]) {
  return problems
    .map(({ code, ...detail }) =>
      Object.keys(detail).length ? `${code} ${JSON.stringify(detail)}` : code,
    )
    .join("; ");
}

export function createOpenRouterResearchAssistant({
  apiKey,
  activeReadingDerivatives,
}: {
  apiKey: string;
  activeReadingDerivatives: Pick<ActiveReadingDerivativeOperations, "read">;
}): ResearchAssistantOperations {
  const openrouter = createOpenRouter({ apiKey });
  return createResearchAssistant(
    (model) => openrouter.chat(model),
    activeReadingDerivatives,
    { processingEndpointClass: "ordinary-cloud" },
  );
}
