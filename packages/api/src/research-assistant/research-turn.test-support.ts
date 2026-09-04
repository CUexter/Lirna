import type { UIMessageChunk } from "ai";

import type { ResearchAssistantOperations } from "./research-assistant";
import type { ResearchEvidenceSessionSnapshot } from "./research-evidence-session-contract";
import { completeResearchEvidenceSession } from "./research-evidence-session-stream";
import type { ResearchThreadOperations } from "./research-thread-contract";

const threadId = "30000000-0000-4000-8000-000000000000";

export function input() {
  return {
    expectedSelectedLeafMessageId: "40000000-0000-4000-8000-000000000000",
    questionMessageId: "40000000-0000-4000-8000-000000000000",
    threadId,
    sourceId: "source-one",
    sourceStateId: "state-one",
    componentIdentity: "active:/",
    question: "What is the central claim?",
    sourceTitle: "Test entry",
    componentLabel: "Main entry",
    sourceText: "Verified passage.",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: "Verified passage.",
        role: "main" as const,
      },
    ],
  };
}

export function assistant(
  stream: ReadableStream<UIMessageChunk>,
  snapshot?: ResearchEvidenceSessionSnapshot,
) {
  return managedResearchAssistant(
    {
      async answer() {
        return stream;
      },
    },
    snapshot,
  );
}

export function managedResearchAssistant(
  delegate: ResearchAssistantOperations,
  snapshot = evidenceSnapshot(),
): ResearchAssistantOperations {
  return {
    async answer(input, options) {
      options?.onEvidenceSessionUpdate?.(snapshot);
      return completeResearchEvidenceSession(
        await delegate.answer(input, options),
        {
          snapshot: () => snapshot,
          validateReferences: async () => true,
          expire() {},
        },
        {
          commit: options?.commit,
          onError: options?.onError,
          onReceipt: options?.onEvidenceSessionReceipt,
        },
      );
    },
  };
}

export function evidenceSnapshot(
  overrides: Partial<ResearchEvidenceSessionSnapshot> = {},
): ResearchEvidenceSessionSnapshot {
  return {
    sessionId: "session-test",
    sourceStateId: "state-one",
    resolverVersion: "lexical-v1",
    indexVersion: "reading-components-v1",
    budget: {
      maximumDiscoveries: 12,
      maximumCandidatesPerDiscovery: 5,
      maximumAdmissions: 12,
      maximumModelSteps: 8,
      maximumTotalEvidenceCharacters: 100_000,
    },
    consumption: {
      discoveries: 1,
      candidates: 1,
      admissions: 1,
      modelSteps: 2,
      evidenceCharacters: 17,
    },
    componentScope: ["active:/"],
    candidateCount: 1,
    reasonCodes: [],
    admittedCount: 1,
    refusedCount: 0,
    budgetExhausted: false,
    ...overrides,
  };
}

export function threads(
  commitAnswer: ResearchThreadOperations["commitAnswer"],
): Pick<ResearchThreadOperations, "commitAnswer"> {
  return { commitAnswer };
}

export type RecordedAnswer = Parameters<
  ResearchThreadOperations["commitAnswer"]
>[0] & { role: "assistant" };

export function recordingThreads(appended: RecordedAnswer[]) {
  return threads(async (received) => {
    appended.push({ ...received, role: "assistant" });
    return {
      id: received.answerMessageId,
      parentMessageId: received.questionMessageId,
      role: "assistant",
      content: received.content,
      model: received.model,
      createdAt: "2026-09-02T12:00:00.000Z",
    };
  });
}

export async function collect(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

export function answerStream(
  text: string,
  completed = true,
  finishReason: "stop" | "error" = "stop",
  includeLedger = true,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      if (includeLedger)
        controller.enqueue(
          validLedgerOutput([
            {
              key: "answer",
              text,
              kind: "original-reasoning",
              evidence: [],
            },
          ]),
        );
      controller.enqueue({ type: "text-start", id: "assistant-text" });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: text,
      });
      controller.enqueue({ type: "text-end", id: "assistant-text" });
      if (completed) controller.enqueue({ type: "finish", finishReason });
      controller.close();
    },
  });
}

export function multiStepStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start-step" });
      controller.enqueue({
        type: "text-delta",
        id: "planning-text",
        delta: "Let me inspect the supplement.",
      });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue(
        validLedgerOutput([
          {
            key: "answer",
            text: "## Grounded connection",
            kind: "original-reasoning",
            evidence: [],
          },
        ]),
      );
      controller.enqueue({ type: "start-step" });
      controller.enqueue({
        type: "text-delta",
        id: "answer-text",
        delta: "## Grounded connection",
      });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

export function evidenceStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "reference-call",
        output: {
          kind: "source-passage-reference",
          id: "10000000-0000-4000-8000-000000000000",
          evidenceAlias: "ev_1",
          componentIdentity: "active:/",
          componentLabel: "Main entry",
          selection: {
            offsetBasis: "normalized-derivative-text-v1",
            normalizedStartOffset: 0,
            normalizedEndOffset: 17,
            exactText: "Verified passage.",
            prefix: "",
            suffix: "",
          },
        },
      });
      controller.enqueue(
        validLedgerOutput([
          {
            key: "claim_1",
            text: "The passage grounds this claim.",
            kind: "source-dependent",
            evidence: [{ alias: "ev_1", relation: "supports" }],
          },
        ]),
      );
      controller.enqueue({ type: "text-start", id: "assistant-text" });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: "The passage grounds this claim.[^ev_1]",
      });
      controller.enqueue({ type: "text-end", id: "assistant-text" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

function validLedgerOutput(claims: unknown[]): UIMessageChunk {
  return {
    type: "tool-output-available",
    toolCallId: "prepare-answer",
    output: {
      kind: "answer-ledger",
      outcome: "valid",
      ledger: { claims },
    },
  };
}
