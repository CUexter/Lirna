import {
  type LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";

import type {
  ResearchAnswerAttemptInput,
  ResearchAnswerAttemptOperations,
  ResearchAnswerRepairInput,
} from "./research-answer-attempt";
import {
  finalSynthesisInstruction,
  researchInstructions,
} from "./research-assistant-context";
import type { ResearchAssistantModel } from "./research-assistant-contract";
import { maximumAnswerLedgerAttempts } from "./research-evidence-session-contract";
import { createResearchEvidenceTools } from "./research-evidence-tools";

export function createNativeResearchAnswerAttempts(
  model: LanguageModel | ((model: ResearchAssistantModel) => LanguageModel),
): ResearchAnswerAttemptOperations<UIMessageChunk> {
  const resolveModel = (modelId: ResearchAssistantModel) =>
    typeof model === "function" ? model(modelId) : model;
  return {
    async start(input) {
      const tools = createResearchEvidenceTools(input.evidence);
      const agent = new ToolLoopAgent({
        model: resolveModel(input.model),
        instructions: researchInstructions().join(" "),
        prepareStep: ({ instructions, stepNumber }) =>
          prepareResearchStep(input, instructions, stepNumber),
        stopWhen: stepCountIs(input.maximumModelSteps),
        tools,
      });
      const result = await agent.stream({
        messages: [
          ...input.history,
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              ...input.attachments.map((attachment) => ({
                type: "file" as const,
                data: attachment.data,
                filename: attachment.filename,
                mediaType: attachment.mediaType,
              })),
            ],
          },
        ],
      });
      return toUIMessageStream({
        stream: result.stream,
        tools,
        sendReasoning: false,
        onError: input.onError,
      });
    },
    async repair(input) {
      return repairResearchAnswer(resolveModel(input.model), input);
    },
  };
}

function prepareResearchStep(
  input: ResearchAnswerAttemptInput,
  instructions: unknown,
  stepNumber: number,
) {
  input.evidence.beginModelStep(stepNumber);
  if (input.evidence.hasValidAnswerLedger())
    return {
      instructions: `${String(instructions ?? "")} ${finalSynthesisInstruction}`,
      toolChoice: "none" as const,
    };
  const mustPrepareLedger =
    input.evidence.snapshot().budgetExhausted ||
    stepNumber >= Math.max(0, input.maximumModelSteps - 3);
  if (
    mustPrepareLedger &&
    input.evidence.answerLedgerAttempts() < maximumAnswerLedgerAttempts
  )
    return {
      instructions: `${String(instructions ?? "")} Prepare the answer ledger now. Call prepareAnswer and no other tool. If a prior ledger was invalid, repair the reported structural problems.`,
      toolChoice: { type: "tool" as const, toolName: "prepareAnswer" as const },
    };
  return mustPrepareLedger
    ? {
        instructions: `${String(instructions ?? "")} The answer ledger could not be validated within its repair budget. State that the answer could not be completed because its evidence structure remained invalid. Do not cite evidence or call tools.`,
        toolChoice: "none" as const,
      }
    : undefined;
}

async function repairResearchAnswer(
  model: LanguageModel,
  input: ResearchAnswerRepairInput,
) {
  const ledger = input.evidence.validAnswerLedger();
  const agent = new ToolLoopAgent({
    model,
    instructions: [
      ...researchInstructions(),
      `Your previous final answer failed structural evidence validation: ${describeProblems(input.problems)}. Write a corrected final answer now in concise natural Markdown. Cover exactly the claims in this validated ledger: ${JSON.stringify(ledger)}. Preserve each declared claim text verbatim, place only declared alias and relation pairs immediately after the claim they ground, and use an empty :::quote[ev_1] then ::: block only when exact wording matters. Do not call or imitate tools.`,
    ].join(" "),
    prepareStep: () => {
      input.evidence.beginModelStep(
        input.evidence.snapshot().consumption.modelSteps,
      );
      return { toolChoice: "none" as const };
    },
    stopWhen: stepCountIs(1),
  });
  const result = await agent.stream({
    messages: [{ role: "user", content: input.prompt }],
  });
  return toUIMessageStream({
    stream: result.stream,
    sendReasoning: false,
    onError: input.onError,
  });
}

function describeProblems(problems: ResearchAnswerRepairInput["problems"]) {
  return problems
    .map(({ code, ...detail }) =>
      Object.keys(detail).length ? `${code} ${JSON.stringify(detail)}` : code,
    )
    .join("; ");
}
