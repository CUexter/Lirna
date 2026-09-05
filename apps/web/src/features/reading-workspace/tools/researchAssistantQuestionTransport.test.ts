import { expect, mock, test } from "bun:test";

const calls: Array<{ operation: string; input: unknown }> = [];

await mock.module("@/clients/inquiryClient", () => ({
  inquiryClient: {
    sources: {
      assistant: {
        reviseQuestion: async (input: unknown) => {
          calls.push({ operation: "revise", input });
          return { id: "thread-id", messages: [] };
        },
        reviseQuestionWithHistory: async (input: unknown) => {
          calls.push({ operation: "revise-history", input });
          return { id: "thread-id", messages: [] };
        },
        selectQuestion: async (input: unknown) => {
          calls.push({ operation: "select", input });
          return { id: "thread-id", messages: [] };
        },
      },
    },
  },
}));

const {
  reviseResearchQuestion,
  reviseResearchQuestionWithHistory,
  selectResearchQuestion,
} = await import("./researchAssistantTransport");

test("transports question revision and selection concurrency tokens", async () => {
  const scope = {
    sourceId: "source-id",
    stateId: "state-id",
    threadId: "thread-id",
  };
  await reviseResearchQuestion({
    ...scope,
    questionMessageId: "question-id",
    expectedSelectedLeafMessageId: "selected-leaf-id",
    question: "Revised question",
    attachments: [
      {
        dataUrl: "data:text/plain;base64,dGVzdA==",
        filename: "evidence.txt",
        mediaType: "text/plain",
        size: 4,
      },
    ],
  });
  await reviseResearchQuestionWithHistory({
    ...scope,
    questionMessageId: "question-id",
    expectedSelectedLeafMessageId: "selected-leaf-id",
    question: "Revised question with existing history",
  });
  await selectResearchQuestion({
    ...scope,
    questionMessageId: "alternative-question-id",
    expectedSelectedLeafMessageId: "revised-answer-id",
  });

  expect(calls).toEqual([
    {
      operation: "revise",
      input: expect.objectContaining({
        questionMessageId: "question-id",
        expectedSelectedLeafMessageId: "selected-leaf-id",
        question: "Revised question",
      }),
    },
    {
      operation: "revise-history",
      input: {
        ...scope,
        questionMessageId: "question-id",
        expectedSelectedLeafMessageId: "selected-leaf-id",
        question: "Revised question with existing history",
      },
    },
    {
      operation: "select",
      input: {
        ...scope,
        questionMessageId: "alternative-question-id",
        expectedSelectedLeafMessageId: "revised-answer-id",
      },
    },
  ]);
});
