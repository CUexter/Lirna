import { expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { ResearchThreadOperations } from "../../research-assistant/research-thread-contract";
import { createTestContext } from "../application-test-support";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

const threadId = "30000000-0000-4000-8000-000000000000";

test("resumes the selected Research-thread path without changing its transcript", async () => {
  const researchThreads = unusedResearchThreadOperations();
  researchThreads.projectSelectedPath = async () => ({
    id: threadId,
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Existing inquiry",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:01:00.000Z",
    messages: [
      {
        id: "40000000-0000-4000-8000-000000000000",
        role: "user",
        content: "What is the central claim?",
        selectedText: "Synthetic",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "50000000-0000-4000-8000-000000000000",
        parentMessageId: "40000000-0000-4000-8000-000000000000",
        role: "assistant",
        content: "The existing answer remains exact.",
        references: [
          {
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
        createdAt: "2026-09-01T12:01:00.000Z",
      },
    ],
  });
  const resumed = await call(
    sourcesRouter.assistant.get,
    { sourceId, stateId, threadId },
    { context: createTestContext({ researchThreads }) },
  );

  expect(resumed.messages).toEqual([
    expect.objectContaining({
      role: "user",
      content: "What is the central claim?",
      selectedText: "Synthetic",
    }),
    expect.objectContaining({
      role: "assistant",
      content: "The existing answer remains exact.",
      references: [
        expect.objectContaining({
          selection: expect.objectContaining({ exactText: "Synthetic" }),
        }),
      ],
    }),
  ]);
});

test.each([
  {
    name: "media type",
    attachment: {
      dataUrl: "data:application/pdf;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
      filename: "evidence.txt",
      mediaType: "text/plain" as const,
      size: 18,
    },
    message: "Attachment evidence.txt does not match its media type",
  },
  {
    name: "size metadata",
    attachment: {
      dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
      filename: "evidence.txt",
      mediaType: "text/plain" as const,
      size: 1,
    },
    message: "Attachment evidence.txt has invalid size metadata",
  },
])(
  "rejects temporary evidence with invalid $name",
  async ({ attachment, message }) => {
    await expect(
      call(
        sourcesRouter.assistant.ask,
        {
          sourceId,
          stateId,
          componentIdentity: "active:/",
          expectedSelectedLeafMessageId: null,
          question: "What does this file add?",
          threadId,
          attachments: [attachment],
        },
        { context: readingContext() },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message });
  },
);

test("rejects selected evidence that does not match the admitted Source state", async () => {
  await expect(
    call(
      sourcesRouter.assistant.ask,
      {
        sourceId,
        stateId,
        componentIdentity: "active:/",
        expectedSelectedLeafMessageId: null,
        question: "What does this passage claim?",
        threadId,
        selection: {
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 0,
          normalizedEndOffset: 9,
          exactText: "Different",
          prefix: "",
          suffix: " reading text.",
        },
      },
      { context: readingContext() },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Selected Source-state evidence no longer matches",
  });
});

function readingContext() {
  return createTestContext({
    admittedSourceStates: admittedSourceStatesStub({
      async getReading() {
        const reading = readingFixture();
        const component = reading.components[0];
        if (!component) throw new Error("Fixture needs a reading component");
        component.plainText = "Synthetic reading text.";
        return reading;
      },
    }),
    researchTurns: {
      async answer() {
        throw new Error("Research turn must not start for invalid input");
      },
    },
  });
}

function unusedResearchThreadOperations(): ResearchThreadOperations {
  const unexpected = async () => {
    throw new Error("Unexpected Research-thread operation");
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
  };
}
