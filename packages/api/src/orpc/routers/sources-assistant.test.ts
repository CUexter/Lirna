import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { UIMessageChunk } from "ai";
import type { Context } from "../../context";
import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import type { ResearchThreadOperations } from "../../research-assistant/research-thread-contract";
import { createResearchTurnOperations } from "../../research-assistant/research-turn";
import { managedResearchAssistant } from "../../research-assistant/research-turn.test-support";
import { createTestContext } from "../application-test-support";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

test("creates a resumable Research thread for the active component", async () => {
  const testContext = context({
    async answer() {
      return assistantStream("Unused");
    },
  });
  let created: Parameters<ResearchThreadOperations["create"]>[0] | undefined;
  testContext.researchThreads.create = async (input) => {
    created = input;
    return {
      id: "30000000-0000-4000-8000-000000000000",
      ...input,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      messages: [],
    };
  };

  const thread = await call(
    sourcesRouter.assistant.create,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "How does the central argument work?",
    },
    { context: testContext },
  );

  expect(thread.title).toBe("How does the central argument work?");
  expect(created).toEqual({
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "How does the central argument work?",
  });
});

test("asks about exact evidence with a rendered-only publisher anchor", async () => {
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  let received:
    | Parameters<ResearchAssistantOperations["answer"]>[0]
    | undefined;
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What is the central claim?",
      threadId: "30000000-0000-4000-8000-000000000000",
      attachments: [
        {
          dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
          filename: "evidence.txt",
          mediaType: "text/plain",
          size: 18,
        },
      ],
      selection: {
        publisherAnchor: "rendered-only-anchor",
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 0,
        normalizedEndOffset: 9,
        exactText: "Synthetic",
        prefix: "",
        suffix: " reading text.",
      },
    },
    {
      context: context(
        {
          async answer(input) {
            received = input;
            return assistantStream("A **provisional** answer.", {
              componentIdentity: "active:/",
              componentLabel: "Main entry",
              selection: {
                offsetBasis: "normalized-derivative-text-v1",
                normalizedStartOffset: 0,
                normalizedEndOffset: 9,
                exactText: "Synthetic",
                prefix: "",
                suffix: " reading text.",
              },
            });
          },
        },
        appended,
      ),
    },
  );

  const chunks: UIMessageChunk[] = [];
  for await (const chunk of result) chunks.push(chunk);
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "assistant-text",
    delta: "A **provisional** answer.",
  });
  expect(received).toMatchObject({
    model: "z-ai/glm-5.3-flash",
    question: "What is the central claim?",
    sourceTitle: "Test entry",
    componentLabel: "Main entry",
    selectedText: "Synthetic",
    sourceText: "Synthetic reading text.",
    attachments: [
      {
        data: new URL("data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl"),
        filename: "evidence.txt",
        mediaType: "text/plain",
      },
    ],
  });
  expect(appended).toEqual([
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      role: "user",
      content: "What is the central claim?",
      selectedText: "Synthetic",
    },
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      role: "assistant",
      content: "A **provisional** answer.",
      references: [
        {
          id: "50000000-0000-4000-8000-000000000000",
          componentIdentity: "active:/",
          componentLabel: "Main entry",
          selection: {
            offsetBasis: "normalized-derivative-text-v1",
            normalizedStartOffset: 0,
            normalizedEndOffset: 9,
            exactText: "Synthetic",
            prefix: "",
            suffix: " reading text.",
          },
        },
      ],
    },
  ]);
});

test("rejects temporary evidence that does not match its media type", async () => {
  const request = call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What does this file add?",
      threadId: "30000000-0000-4000-8000-000000000000",
      attachments: [
        {
          dataUrl: "data:application/pdf;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
          filename: "evidence.txt",
          mediaType: "text/plain" as const,
          size: 18,
        },
      ],
    },
    {
      context: context({
        async answer() {
          return assistantStream("This must not be called.");
        },
      }),
    },
  );

  await expect(request).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Attachment evidence.txt does not match its media type",
  });
});

test("rejects temporary evidence with false size metadata", async () => {
  const request = call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What does this file add?",
      threadId: "30000000-0000-4000-8000-000000000000",
      attachments: [
        {
          dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
          filename: "evidence.txt",
          mediaType: "text/plain" as const,
          size: 1,
        },
      ],
    },
    {
      context: context({
        async answer() {
          return assistantStream("This must not be called.");
        },
      }),
    },
  );

  await expect(request).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Attachment evidence.txt has invalid size metadata",
  });
});

test("rejects selected evidence that does not match the admitted Source state", async () => {
  const request = call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What does this passage claim?",
      threadId: "30000000-0000-4000-8000-000000000000",
      selection: {
        offsetBasis: "normalized-derivative-text-v1" as const,
        normalizedStartOffset: 0,
        normalizedEndOffset: 9,
        exactText: "Different",
        prefix: "",
        suffix: " reading text.",
      },
    },
    {
      context: context({
        async answer() {
          return assistantStream("This must not be called.");
        },
      }),
    },
  );

  await expect(request).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Selected Source-state evidence no longer matches",
  });
});

test("observes a late assistant stream failure and returns a useful error", async () => {
  const observations: Record<string, unknown>[] = [];
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What is the central claim?",
      threadId: "30000000-0000-4000-8000-000000000000",
    },
    {
      context: context(
        {
          async answer() {
            return new ReadableStream({
              pull(controller) {
                controller.error(new Error("Provider stream disconnected"));
              },
            });
          },
        },
        appended,
        {
          debugErrors: true,
          observation: {
            requestId: "req-stream-failure",
            emit(_level, record) {
              observations.push(record);
            },
            fail() {},
          },
        },
      ),
    },
  );

  const chunks: UIMessageChunk[] = [];
  for await (const chunk of result) chunks.push(chunk);

  expect(chunks).toEqual([
    {
      type: "error",
      errorText:
        "Research assistant response failed: Provider stream disconnected Error reference: req-stream-failure.",
    },
  ]);
  expect(observations).toHaveLength(2);
  expect(observations[0]).toMatchObject({
    event: "research_assistant.stream_failed",
    operation: "sources.assistant.ask",
    outcome: "failure",
    err: { message: "Provider stream disconnected" },
  });
  expect(observations[1]).toMatchObject({
    event: "research_assistant.session_completed",
    outcome: "provider-failed",
  });
  expect(appended).toEqual([
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      role: "user",
      content: "What is the central claim?",
    },
  ]);
});

test("cancelling a streamed turn preserves only the user question", async () => {
  const observations: Record<string, unknown>[] = [];
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  let modelCancelled = false;
  const testContext = context(
    {
      async answer() {
        return new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "text-delta",
              id: "assistant-text",
              delta: "Partial answer",
            });
          },
          cancel() {
            modelCancelled = true;
          },
        });
      },
    },
    appended,
    {
      observation: {
        requestId: "req-stream-cancelled",
        emit(_level, record) {
          observations.push(record);
        },
        fail() {},
      },
    },
  );
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What is the central claim?",
      threadId: "30000000-0000-4000-8000-000000000000",
    },
    { context: testContext },
  );

  expect(await result.next()).toMatchObject({
    value: { type: "text-delta" },
  });
  await result.return?.();

  expect(modelCancelled).toBe(true);
  expect(appended).toEqual([
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      role: "user",
      content: "What is the central claim?",
    },
  ]);
  expect(observations).toMatchObject([
    {
      event: "research_assistant.session_completed",
      outcome: "cancelled",
    },
  ]);
});

function context(
  researchAssistant: ResearchAssistantOperations,
  appended?: Array<Parameters<ResearchThreadOperations["append"]>[0]>,
  options: Parameters<typeof createTestContext>[1] = {},
): Context {
  const researchThreads: ResearchThreadOperations = {
    async create() {
      throw new Error("Unexpected Research thread creation");
    },
    async list() {
      return [];
    },
    async get() {
      return {
        id: "30000000-0000-4000-8000-000000000000",
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
    async append(input) {
      appended?.push(input);
      return {
        id: crypto.randomUUID(),
        role: input.role,
        content: input.content,
        ...(input.selectedText ? { selectedText: input.selectedText } : {}),
        createdAt: "2026-09-01T12:00:00.000Z",
      };
    },
  };
  return createTestContext(
    {
      admittedSourceStates: admittedSourceStatesStub({
        async getReading() {
          const reading = readingFixture();
          const component = reading.components[0];
          if (!component) throw new Error("Fixture needs a reading component");
          component.plainText = "Synthetic reading text.";
          return reading;
        },
      }),
      researchTurns: createResearchTurnOperations(
        managedResearchAssistant(researchAssistant),
        researchThreads,
      ),
      researchThreads,
    },
    options,
  );
}

function assistantStream(
  text: string,
  reference?: {
    componentIdentity: string;
    componentLabel: string;
    selection: {
      offsetBasis: "normalized-derivative-text-v1";
      normalizedStartOffset: number;
      normalizedEndOffset: number;
      exactText: string;
      prefix: string;
      suffix: string;
    };
  },
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-message" });
      if (reference) {
        controller.enqueue({
          type: "tool-output-available",
          toolCallId: "reference-call",
          output: {
            kind: "source-passage-reference",
            id: "50000000-0000-4000-8000-000000000000",
            evidenceAlias: "ev_1",
            ...reference,
          },
        });
      }
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
                text,
                kind: "original-reasoning",
                evidence: [],
              },
            ],
          },
        },
      });
      controller.enqueue({ type: "text-start", id: "assistant-text" });
      controller.enqueue({
        type: "text-delta",
        id: "assistant-text",
        delta: text,
      });
      controller.enqueue({ type: "text-end", id: "assistant-text" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}
