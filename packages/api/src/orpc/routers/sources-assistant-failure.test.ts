import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { UIMessageChunk } from "ai";
import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import type { ResearchThreadOperations } from "../../research-assistant/research-thread-contract";
import { createResearchTurnOperations } from "../../research-assistant/research-turn";
import { createTestContext } from "../application-test-support";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

const threadId = "30000000-0000-4000-8000-000000000000";

test("failed final persistence preserves only the user question", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const researchThreads = threads(async (input) => {
    if (input.role === "assistant") return undefined;
    appended.push(input);
    return message(input.role, input.content);
  });
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What is the central claim?",
      threadId,
    },
    {
      context: createTestContext(
        {
          admittedSourceStates: admittedSourceStatesStub({
            async getReading() {
              const reading = readingFixture();
              const component = reading.components[0];
              if (!component)
                throw new Error("Fixture needs a reading component");
              component.plainText = "Synthetic reading text.";
              return reading;
            },
          }),
          researchThreads,
          researchTurns: createResearchTurnOperations(
            assistant(completedStream()),
            researchThreads,
          ),
        },
        { debugErrors: true },
      ),
    },
  );

  const chunks: UIMessageChunk[] = [];
  for await (const chunk of result) chunks.push(chunk);

  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText:
      "Research assistant response failed: Research answer could not be persisted",
  });
  expect(appended).toEqual([
    {
      threadId,
      role: "user",
      content: "What is the central claim?",
    },
  ]);
});

test("observes evidence refusal as a content-free research outcome", async () => {
  const observations: Array<{
    level: string;
    record: Record<string, unknown>;
  }> = [];
  const researchThreads = threads(async (input) =>
    message(input.role, input.content),
  );
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "Do not retain this question",
      threadId,
    },
    {
      context: createTestContext(
        {
          admittedSourceStates: admittedSourceStatesStub({
            async getReading() {
              return readingFixture();
            },
          }),
          researchThreads,
          researchTurns: createResearchTurnOperations(
            {
              async answer(_input, options) {
                options?.onEvidenceSessionUpdate?.({
                  sessionId: "session-refused",
                  sourceStateId: stateId,
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
                    candidates: 0,
                    admissions: 0,
                    modelSteps: 2,
                    evidenceCharacters: 0,
                  },
                  componentScope: ["supplement:/private"],
                  candidateCount: 0,
                  reasonCodes: ["scope-denied"],
                  admittedCount: 0,
                  refusedCount: 1,
                  budgetExhausted: false,
                });
                options?.onEvidenceResolution?.({
                  operation: "findEvidence",
                  outcome: "refused",
                  reasonCode: "scope-denied",
                  componentScope: ["supplement:/private"],
                  candidateCount: 0,
                  durationMs: 4.5,
                });
                return completedStream();
              },
            },
            researchThreads,
          ),
        },
        {
          observation: {
            requestId: "req-evidence-refused",
            emit(level, record) {
              observations.push({ level, record });
            },
            fail() {},
          },
        },
      ),
    },
  );

  for await (const _chunk of result) {
    // Consume the response so the Research turn completes.
  }

  expect(observations).toHaveLength(2);
  expect(observations[0]).toEqual({
    level: "info",
    record: {
      event: "research_assistant.evidence_resolution",
      operation: "findEvidence",
      outcome: "refused",
      reasonCode: "scope-denied",
      componentScope: ["supplement:/private"],
      candidateCount: 0,
      durationMs: 4.5,
    },
  });
  expect(observations[1]).toMatchObject({
    level: "info",
    record: {
      event: "research_assistant.session_completed",
      sessionId: "session-refused",
      researchThreadId: threadId,
      sourceStateId: stateId,
      outcome: "refused",
      reasonCodes: ["scope-denied"],
      latencyBucket: expect.any(String),
    },
  });
  expect(JSON.stringify(observations)).not.toContain(
    "Do not retain this question",
  );
  expect(JSON.stringify(observations)).not.toContain("Completed answer");
});

function assistant(stream: ReadableStream<UIMessageChunk>) {
  return {
    async answer() {
      return stream;
    },
  } satisfies ResearchAssistantOperations;
}

function threads(
  append: ResearchThreadOperations["append"],
): ResearchThreadOperations {
  return {
    async create() {
      throw new Error("Unexpected Research thread creation");
    },
    async list() {
      return [];
    },
    async get() {
      return {
        id: threadId,
        sourceId,
        stateId,
        componentIdentity: "active:/",
        componentLabel: "Main entry",
        title: "Existing inquiry",
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
        messages: [],
      };
    },
    append,
  };
}

function message(role: "user" | "assistant", content: string) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: "2026-09-01T12:00:00.000Z",
  };
}

function completedStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: "tool-output-available",
        toolCallId: "prepare-answer",
        output: {
          kind: "answer-ledger",
          outcome: "valid",
          ledger: {
            claims: [
              {
                key: "answer",
                text: "Completed answer",
                kind: "original-reasoning",
                evidence: [],
              },
            ],
          },
        },
      });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: "Completed answer",
      });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
