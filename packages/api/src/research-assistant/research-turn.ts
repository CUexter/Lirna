import type { UIMessageChunk } from "ai";
import { z } from "zod";
import { authoredTargetInputSchema } from "../authored-targets/authored-target";
import { compileResearchAnswer } from "./research-answer-markers";
import type {
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import type {
  AliasedResearchPassageReference,
  ResearchThreadOperations,
} from "./research-thread-contract";

export interface ResearchTurnInput extends ResearchAssistantInput {
  threadId: string;
}

export interface ResearchTurnOperations {
  answer(
    input: ResearchTurnInput,
    options?: { onError?: (error: unknown) => string },
  ): Promise<ReadableStream<UIMessageChunk>>;
}

export function createResearchTurnOperations(
  assistant: ResearchAssistantOperations,
  threads: Pick<ResearchThreadOperations, "append">,
): ResearchTurnOperations {
  return {
    async answer({ threadId, ...input }, options) {
      const modelStream = await assistant.answer(input, options);
      return researchTurnStream(
        modelStream,
        async (content, references) => {
          const persisted = await threads.append({
            threadId,
            role: "assistant",
            content,
            ...(references.length ? { references } : {}),
          });
          if (!persisted)
            throw new Error("Research answer could not be persisted");
        },
        options?.onError,
      );
    },
  };
}

function researchTurnStream(
  stream: ReadableStream<UIMessageChunk>,
  persist: (
    content: string,
    references: ReturnType<typeof compileResearchAnswer>["references"],
  ) => Promise<void>,
  onError?: (error: unknown) => string,
) {
  const reader = stream.getReader();
  const answer = new AssistantAnswer();
  let cancelled = false;
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (!next.done) {
          answer.accept(next.value);
          if (!cancelled) controller.enqueue(next.value);
          return;
        }
        if (cancelled) return;
        await answer.commit(persist);
        controller.close();
      } catch (error) {
        if (cancelled) return;
        controller.enqueue({
          type: "error",
          errorText: onError?.(error) ?? "Research assistant response failed.",
        });
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason);
    },
  });
}

class AssistantAnswer {
  private currentStepContent = "";
  private finalStepContent = "";
  private hasStepBoundaries = false;
  private readonly references: AliasedResearchPassageReference[] = [];
  completed = false;
  completionError?: Error;
  streamFailed = false;

  accept(chunk: UIMessageChunk) {
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
    }
    if (chunk.type === "error") this.streamFailed = true;
    if (chunk.type === "abort")
      this.completionError = new Error(
        chunk.reason ?? "Research assistant response was aborted",
      );
    if (chunk.type === "finish") {
      if (chunk.finishReason === "stop") this.completed = true;
      else
        this.completionError = new Error(
          `Research assistant response ended with ${chunk.finishReason ?? "an unknown reason"}`,
        );
    }
  }

  async commit(
    persist: Parameters<typeof researchTurnStream>[1],
  ): Promise<void> {
    if (this.streamFailed) return;
    if (this.completionError) throw this.completionError;
    if (!this.completed)
      throw new Error("Research assistant response ended before completion");
    const content = this.hasStepBoundaries
      ? this.finalStepContent
      : this.currentStepContent;
    if (!content.trim()) return;
    const compiled = compileResearchAnswer(content, this.references);
    await persist(compiled.content, compiled.references);
  }
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
