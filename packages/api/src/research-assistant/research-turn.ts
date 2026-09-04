import type { UIMessageChunk } from "ai";
import type {
  ResearchAssistantAnswerOptions,
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import type { ResearchThreadOperations } from "./research-thread-contract";

export interface ResearchTurnInput extends ResearchAssistantInput {
  questionMessageId: string;
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
  threads: Pick<ResearchThreadOperations, "commitAnswer">,
): ResearchTurnOperations {
  return {
    async answer({ questionMessageId, threadId, ...input }, options) {
      return assistant.answer(input, {
        ...options,
        commit: {
          researchThreadId: threadId,
          persist: async (content, references) => {
            const persisted = await threads.commitAnswer({
              threadId,
              questionMessageId,
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
