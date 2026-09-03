import { expect, test } from "bun:test";
import { simulateReadableStream, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { activeReadingStub } from "../annotations/annotation-store.test-support";
import type { EvidenceResolutionObservation } from "./evidence-resolution";
import { createResearchAssistant } from "./research-assistant";

test("cancellation interrupts an admission awaiting Derivative validation", async () => {
  const activeReading = activeReadingStub(true);
  let readCount = 0;
  let admissionStarted: (() => void) | undefined;
  let releaseValidation: (() => void) | undefined;
  const admissionPending = new Promise<void>((resolve) => {
    admissionStarted = resolve;
  });
  const validationGate = new Promise<void>((resolve) => {
    releaseValidation = resolve;
  });
  const observations: EvidenceResolutionObservation[] = [];
  let modelCall = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      modelCall += 1;
      if (modelCall === 1)
        return toolCallStream("find", "findEvidence", {
          componentScope: ["article:main"],
          intent: "readevidence carefully",
          limit: 5,
        });
      return toolCallStream("admit", "admitEvidence", {
        candidateHandle: candidateHandleFromPrompt(prompt),
        purpose: "Ground the answer",
      });
    },
  });
  const answer = await createResearchAssistant(model, {
    async read(input) {
      readCount += 1;
      if (readCount > 1) {
        admissionStarted?.();
        await validationGate;
      }
      return activeReading.read(input);
    },
  }).answer(
    {
      componentIdentity: "article:main",
      componentLabel: "Article",
      components: [
        {
          identity: "article:main",
          label: "Article",
          plainText: "Readevidence carefully.",
          role: "main",
        },
      ],
      question: "What does the evidence say?",
      sourceId: "source-one",
      sourceStateId: "state-one",
      sourceText: "Readevidence carefully.",
      sourceTitle: "Test source",
    },
    { onEvidenceResolution: (observation) => observations.push(observation) },
  );
  const reader = answer.getReader();
  const consume = consumeUntilClosed(reader);

  await admissionPending;
  const cancelled = reader.cancel("client disconnected");
  releaseValidation?.();
  await cancelled;
  await consume;

  expect(readCount).toBe(2);
  expect(observations.some(({ outcome }) => outcome === "admitted")).toBe(
    false,
  );
});

async function consumeUntilClosed(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
) {
  while (!(await reader.read()).done) {
    // Keep pulling until cancellation closes the stream.
  }
}

function candidateHandleFromPrompt(prompt: unknown) {
  const match = JSON.stringify(prompt).match(/candidate_[0-9a-f-]+/);
  if (!match) throw new Error("Expected an evidence candidate handle");
  return match[0];
}

function toolCallStream(id: string, toolName: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        {
          type: "tool-call" as const,
          toolCallId: id,
          toolName,
          input: JSON.stringify(input),
        },
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: undefined },
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
        },
      ],
    }),
  };
}
