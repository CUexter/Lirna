import { randomUUID } from "node:crypto";
import type { UIMessageChunk } from "ai";
import type {
  ResearchAssistantAnswerOptions,
  ResearchAssistantInput,
  ResearchAssistantOperations,
} from "./research-assistant";
import { defaultResearchAssistantModel } from "./research-assistant-contract";
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
      const answerMessageId = randomUUID();
      const model = input.model ?? defaultResearchAssistantModel;
      const stream = await assistant.answer(
        { ...input, model },
        {
          ...options,
          commit: {
            answerMessageId,
            questionMessageId,
            researchThreadId: threadId,
            persist: async (content, references) => {
              const persisted = await threads.commitAnswer({
                answerMessageId,
                threadId,
                questionMessageId,
                content,
                model,
                ...(references.length ? { references } : {}),
              });
              if (!persisted)
                throw new Error("Research answer could not be persisted");
            },
          },
        },
      );
      return identifyAnswerStream(stream, answerMessageId);
    },
  };
}

function identifyAnswerStream(
  stream: ReadableStream<UIMessageChunk>,
  answerMessageId: string,
) {
  const reader = stream.getReader();
  let initialized = false;
  let buffered: UIMessageChunk | undefined;
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        if (!initialized) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            return;
          }
          initialized = true;
          if (next.value.type === "start") {
            controller.enqueue({ ...next.value, messageId: answerMessageId });
          } else if (next.value.type === "error") {
            controller.enqueue(next.value);
          } else {
            buffered = next.value;
            controller.enqueue({ type: "start", messageId: answerMessageId });
          }
          return;
        }
        if (buffered) {
          controller.enqueue(buffered);
          buffered = undefined;
          return;
        }
        while (true) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            return;
          }
          if (next.value.type !== "start") {
            controller.enqueue(next.value);
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}
