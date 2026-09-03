import type { UIMessageChunk } from "ai";
import type {
  ResearchAssistantAnswerOptions,
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";

export interface ResearchTurnInput extends ResearchAssistantInput {
  threadId: string;
}

export interface ResearchTurnOperations {
  answer(
    input: ResearchTurnInput,
    options?: ResearchAssistantAnswerOptions,
  ): Promise<ReadableStream<UIMessageChunk>>;
}

export function createResearchTurnOperations(
  assistant: ResearchAssistantOperations,
  threads: Pick<ResearchThreadOperations, "append">,
): ResearchTurnOperations {
  return {
    async answer({ threadId, ...input }, options) {
      return assistant.answer(input, {
        ...options,
        commit: {
          researchThreadId: threadId,
          persist: async (content, references) => {
            const persisted = await threads.append({
              threadId,
              role: "assistant",
              content,
              ...(references.length ? { references } : {}),
            });
            if (!persisted)
              throw new Error("Research answer could not be persisted");
          },
        },
      });
    },
  };
}
