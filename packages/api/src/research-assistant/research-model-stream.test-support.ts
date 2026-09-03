import { simulateReadableStream } from "ai";

export function candidateHandleFromPrompt(prompt: unknown, index = 0) {
  const matches = JSON.stringify(prompt).match(/candidate_[0-9a-f-]+/g);
  const match = matches?.[index];
  if (!match) throw new Error("Expected an evidence candidate handle");
  return match;
}

export function toolCallStream(
  id: string,
  toolName: string,
  input: object,
): { stream: ReturnType<typeof simulateReadableStream> } {
  return {
    stream: simulateReadableStream({
      chunks: [
        {
          type: "tool-call" as const,
          toolCallId: id,
          toolName,
          input: JSON.stringify(input),
        },
        finishChunk("tool-calls"),
      ],
    }),
  };
}

export function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        finishChunk("stop"),
      ],
    }),
  };
}

function finishChunk(unified: "stop" | "tool-calls") {
  return {
    type: "finish" as const,
    finishReason: { unified, raw: undefined },
    logprobs: undefined,
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  };
}
