import { expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { ResearchThreadOperations } from "../../research-assistant/research-thread-contract";
import { createTestContext } from "../application-test-support";
import { sourceId, stateId } from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

const creationId = "30000000-0000-4000-8000-000000000020";
const sourceThreadId = "40000000-0000-4000-8000-000000000020";
const sourceAnswerMessageId = "50000000-0000-4000-8000-000000000020";
const newThreadId = "60000000-0000-4000-8000-000000000020";

test("creates and returns a related Research thread through the assistant surface", async () => {
  let received:
    | Parameters<ResearchThreadOperations["createRelatedThread"]>[0]
    | undefined;
  const context = createTestContext({
    researchThreads: {
      ...unusedThreads(),
      async createRelatedThread(input) {
        received = input;
        return { status: "created", thread: relatedThread() };
      },
    },
  });

  const result = await call(
    sourcesRouter.assistant.createRelated,
    {
      creationId,
      sourceId,
      stateId,
      sourceThreadId,
      sourceAnswerMessageId,
      title: "  A materially different inquiry  ",
    },
    { context },
  );

  expect(received).toEqual({
    creationId,
    sourceId,
    stateId,
    sourceThreadId,
    sourceAnswerMessageId,
    title: "A materially different inquiry",
  });
  expect(result).toEqual(relatedThread());
});

test("reports creation ID input conflicts", async () => {
  const context = createTestContext({
    researchThreads: {
      ...unusedThreads(),
      async createRelatedThread() {
        return { status: "conflict" };
      },
    },
  });

  await expect(
    call(
      sourcesRouter.assistant.createRelated,
      {
        creationId,
        sourceId,
        stateId,
        sourceThreadId,
        sourceAnswerMessageId,
        title: "Different input",
      },
      { context },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

function unusedThreads(): ResearchThreadOperations {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected Research thread operation");
  };
  return {
    create: unexpected,
    list: unexpected,
    projectSelectedPath: unexpected,
    appendQuestion: unexpected,
    commitAnswer: unexpected,
    historyThroughQuestion: unexpected,
    listChildren: unexpected,
    selectAnswerAlternative: unexpected,
    createRelatedThread: unexpected,
  };
}

function relatedThread() {
  return {
    id: newThreadId,
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "A materially different inquiry",
    createdAt: "2026-09-04T13:00:00.000Z",
    updatedAt: "2026-09-04T13:00:00.000Z",
    messages: [
      {
        id: "70000000-0000-4000-8000-000000000020",
        originMessageId: sourceAnswerMessageId,
        role: "assistant" as const,
        content: "Inherited answer",
        model: "z-ai/glm-5.3-flash" as const,
        createdAt: "2026-09-04T13:00:00.000Z",
      },
    ],
  };
}
