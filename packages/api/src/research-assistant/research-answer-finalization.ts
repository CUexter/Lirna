import type { UIMessageChunk } from "ai";
import { z } from "zod";

import { authoredTargetInputSchema } from "../authored-targets/authored-target";
import {
  type AnswerLedger,
  type AnswerValidationProblem,
  answerLedgerSchema,
  validateResearchAnswer,
} from "./research-answer-ledger";
import { compileResearchAnswer } from "./research-answer-markers";
import { isResearchToolName } from "./research-evidence-session-contract";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

export type PersistResearchAnswer = (
  content: string,
  references: ReturnType<typeof compileResearchAnswer>["references"],
) => Promise<void>;

interface ResearchAssistantEvidenceFinalizer {
  validateReferences(
    references: AliasedResearchPassageReference[],
  ): Promise<boolean>;
}

export class AssistantAnswer {
  private currentStepContent = "";
  private finalStepContent = "";
  private hasStepBoundaries = false;
  private readonly references: AliasedResearchPassageReference[] = [];
  private answerLedger?: AnswerLedger;
  private readonly toolNames = new Map<string, string>();
  finishChunk?: Extract<UIMessageChunk, { type: "finish" }>;
  completed = false;
  completionError?: Error;
  streamFailed = false;

  beginRepair() {
    this.currentStepContent = "";
    this.finalStepContent = "";
    this.hasStepBoundaries = false;
    this.finishChunk = undefined;
    this.completed = false;
    this.completionError = undefined;
    this.streamFailed = false;
  }

  // fallow-ignore-next-line complexity
  accept(chunk: UIMessageChunk) {
    if (chunk.type === "tool-input-available")
      this.toolNames.set(chunk.toolCallId, chunk.toolName);
    if (chunk.type === "start-step") {
      this.hasStepBoundaries = true;
      this.currentStepContent = "";
    }
    if (chunk.type === "text-delta") this.currentStepContent += chunk.delta;
    if (chunk.type === "finish-step")
      this.finalStepContent = this.currentStepContent;
    if (chunk.type === "tool-output-available") {
      const reference = researchPassageReference(chunk.output);
      if (reference) this.references.push(reference);
      const ledger = researchAnswerLedger(chunk.output);
      if (ledger !== undefined) this.answerLedger = ledger;
    }
    if (chunk.type === "error") this.streamFailed = true;
    if (chunk.type === "abort")
      this.completionError = new Error(
        chunk.reason ?? "Research assistant response was aborted",
      );
    if (chunk.type === "finish") {
      this.finishChunk = chunk;
      if (chunk.finishReason === "stop") this.completed = true;
      else
        this.completionError = new Error(
          `Research assistant response ended with ${chunk.finishReason ?? "an unknown reason"}`,
        );
    }
  }

  publicChunk(chunk: UIMessageChunk): UIMessageChunk {
    if (
      chunk.type === "tool-input-available" &&
      researchTool(this.toolNames.get(chunk.toolCallId))
    )
      return { ...chunk, input: {} };
    if (
      chunk.type === "tool-output-available" &&
      researchTool(this.toolNames.get(chunk.toolCallId))
    )
      return { ...chunk, output: contentFreeToolOutput(chunk.output) };
    return chunk;
  }

  async commit(
    persist: PersistResearchAnswer,
    evidenceFinalizer?: ResearchAssistantEvidenceFinalizer,
  ): Promise<ReturnType<typeof compileResearchAnswer> | undefined> {
    if (this.streamFailed) return;
    if (this.completionError) throw this.completionError;
    if (!this.completed)
      throw new Error("Research assistant response ended before completion");
    const content = this.hasStepBoundaries
      ? this.finalStepContent
      : this.currentStepContent;
    if (!content.trim()) return;
    if (!this.answerLedger)
      throw new AnswerValidationError([{ code: "malformed-ledger" }]);
    const validation = validateResearchAnswer(
      content,
      this.answerLedger,
      new Set(this.references.map(({ evidenceAlias }) => evidenceAlias)),
    );
    if (validation.outcome === "invalid")
      throw new AnswerValidationError(validation.problems);
    if (
      evidenceFinalizer &&
      !(await evidenceFinalizer.validateReferences(this.references))
    )
      throw new AnswerValidationError([{ code: "stale-evidence" }]);
    const compiled = compileResearchAnswer(content, this.references);
    await persist(compiled.content, compiled.references);
    return compiled;
  }
}

export class AnswerValidationError extends Error {
  constructor(readonly problems: AnswerValidationProblem[]) {
    super("Research answer evidence validation failed");
    this.name = "AnswerValidationError";
  }
}

function researchTool(name: string | undefined) {
  return name !== undefined && isResearchToolName(name);
}

function contentFreeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return {};
  const value = output as Record<string, unknown>;
  return {
    ...(typeof value.kind === "string" ? { kind: value.kind } : {}),
    ...(typeof value.outcome === "string" ? { outcome: value.outcome } : {}),
    ...(typeof value.reasonCode === "string"
      ? { reasonCode: value.reasonCode }
      : {}),
    ...(typeof value.candidateCount === "number"
      ? { candidateCount: value.candidateCount }
      : {}),
    ...(typeof value.found === "boolean" ? { found: value.found } : {}),
    ...(Array.isArray(value.problems)
      ? {
          problemCodes: value.problems.flatMap((problem) =>
            problem &&
            typeof problem === "object" &&
            "code" in problem &&
            typeof problem.code === "string"
              ? [problem.code]
              : [],
          ),
        }
      : {}),
  };
}

function researchAnswerLedger(output: unknown): AnswerLedger | undefined {
  if (!output || typeof output !== "object") return;
  const value = output as Record<string, unknown>;
  if (value.kind !== "answer-ledger" || value.outcome !== "valid") return;
  const parsed = answerLedgerSchema.safeParse(value.ledger);
  return parsed.success ? parsed.data : undefined;
}

function researchPassageReference(
  output: unknown,
): AliasedResearchPassageReference | undefined {
  if (!output || typeof output !== "object" || !("kind" in output)) return;
  if (output.kind !== "source-passage-reference") return;
  const parsed = z
    .object({
      id: z.string().uuid(),
      evidenceAlias: z.string().regex(/^ev_\d+$/),
      componentIdentity: z.string(),
      componentLabel: z.string(),
      selection: authoredTargetInputSchema,
    })
    .safeParse(output);
  return parsed.success ? parsed.data : undefined;
}
