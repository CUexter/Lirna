import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { UIMessageChunk } from "ai";

import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import type { ResearchEvidenceDecisionReceipt } from "../../research-assistant/research-evidence-session-contract";
import type {
  ResearchThreadMessage,
  ResearchThreadOperations,
} from "../../research-assistant/research-thread-contract";
import { createResearchTurnOperations } from "../../research-assistant/research-turn";
import {
  answerStream,
  evidenceSnapshot,
  evidenceStream,
  managedResearchAssistant,
} from "../../research-assistant/research-turn.test-support";
import { createTestContext } from "../application-test-support";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";
const attachment = {
  dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
  filename: "evidence.txt",
  mediaType: "text/plain" as const,
  size: 18,
};
const secondAttachment = {
  dataUrl: "data:image/png;base64,cG5n",
  filename: "figure.png",
  mediaType: "image/png" as const,
  size: 3,
};

test("retries one durable question through isolated Research Evidence Sessions", async () => {
  const answerInputs: Parameters<ResearchAssistantOperations["answer"]>[0][] =
    [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const committed: Parameters<ResearchThreadOperations["commitAnswer"]>[0][] =
    [];
  let appendedQuestions = 0;
  let attempt = 0;
  const messages = selectedQuestionPath();
  const researchThreads = threadOperations(messages, committed, () => {
    appendedQuestions += 1;
  });
  const assistant: ResearchAssistantOperations = {
    async answer(input, options) {
      answerInputs.push(input);
      attempt += 1;
      const stream =
        attempt === 1
          ? new ReadableStream<UIMessageChunk>({
              pull(controller) {
                controller.error(new Error("Provider unavailable"));
              },
            })
          : evidenceStream();
      return managedResearchAssistant(
        {
          async answer() {
            return stream;
          },
        },
        evidenceSnapshot({
          sessionId: `retry-session-${attempt}`,
          consumption: {
            discoveries: attempt,
            candidates: attempt,
            admissions: attempt,
            modelSteps: attempt,
            evidenceCharacters: attempt * 17,
          },
        }),
      ).answer(input, options);
    },
  };
  const context = createTestContext({
    admittedSourceStates: admittedSourceStatesStub({
      async getReading() {
        return readingFixture();
      },
    }),
    researchEvidenceReceipts: {
      async record(receipt) {
        receipts.push(receipt);
      },
    },
    researchThreads,
    researchTurns: createResearchTurnOperations(assistant, researchThreads),
  });

  const first = await call(sourcesRouter.assistant.retry, retryInput(), {
    context,
  });
  expect(await collect(first)).toEqual([
    expect.objectContaining({ type: "error" }),
  ]);
  expect(committed).toHaveLength(0);

  const second = await call(sourcesRouter.assistant.retry, retryInput(), {
    context,
  });
  expect(await collect(second)).toContainEqual({
    type: "text-delta",
    id: "assistant-text",
    delta: "The passage grounds this claim.[^ev_1]",
  });

  expect(appendedQuestions).toBe(0);
  expect(answerInputs).toHaveLength(2);
  expect(answerInputs[0]).toMatchObject({
    question: "What does the temporary evidence establish?",
    history: [
      { role: "user", content: "What is the background?" },
      { role: "assistant", content: "The selected ancestor answer." },
    ],
    attachments: [
      {
        data: new URL(secondAttachment.dataUrl),
        filename: secondAttachment.filename,
        mediaType: secondAttachment.mediaType,
      },
      {
        data: new URL(attachment.dataUrl),
        filename: attachment.filename,
        mediaType: attachment.mediaType,
      },
    ],
  });
  expect(answerInputs[1]?.attachments?.[0]?.data).not.toBe(
    answerInputs[0]?.attachments?.[0]?.data,
  );
  expect(receipts.map(({ sessionId }) => sessionId)).toEqual([
    "retry-session-1",
    "retry-session-2",
  ]);
  expect(receipts.map(({ consumption }) => consumption.discoveries)).toEqual([
    1, 2,
  ]);
  expect(
    new Set(
      receipts.map(({ attemptedAnswerMessageId }) => attemptedAnswerMessageId),
    ).size,
  ).toBe(2);
  expect(committed).toHaveLength(1);
  expect(committed[0]).toMatchObject({
    questionMessageId: questionId,
    threadId,
    content: expect.stringMatching(
      /^The passage grounds this claim\.\[\^[0-9a-f-]{36}\]$/,
    ),
    references: [
      expect.objectContaining({
        componentIdentity: "active:/",
        selection: expect.objectContaining({ exactText: "Verified passage." }),
      }),
    ],
  });
});

test("requires temporary evidence to be reattached before retrying", async () => {
  let started = false;
  const messages = selectedQuestionPath();
  const researchThreads = threadOperations(messages, [], () => {});
  await expect(
    call(
      sourcesRouter.assistant.retry,
      { ...retryInput(), attachments: undefined },
      {
        context: createTestContext({
          admittedSourceStates: admittedSourceStatesStub(),
          researchThreads,
          researchTurns: {
            async answer() {
              started = true;
              return answerStream("Unexpected");
            },
          },
        }),
      },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message:
      "Reattach temporary evidence before retrying: evidence.txt (text/plain), figure.png (image/png)",
  });
  expect(started).toBe(false);
});

function retryInput() {
  return {
    sourceId,
    stateId,
    threadId,
    questionMessageId: questionId,
    attachments: [secondAttachment, attachment],
  };
}

function selectedQuestionPath(): ResearchThreadMessage[] {
  return [
    message(
      "10000000-0000-4000-8000-000000000001",
      "user",
      "What is the background?",
    ),
    {
      ...message(
        "10000000-0000-4000-8000-000000000002",
        "assistant",
        "The selected ancestor answer.",
      ),
      parentMessageId: "10000000-0000-4000-8000-000000000001",
    },
    {
      ...message(
        questionId,
        "user",
        "What does the temporary evidence establish?",
      ),
      parentMessageId: "10000000-0000-4000-8000-000000000002",
      temporaryEvidence: [
        { filename: attachment.filename, mediaType: attachment.mediaType },
        {
          filename: secondAttachment.filename,
          mediaType: secondAttachment.mediaType,
        },
      ],
    },
  ];
}

function message(
  id: string,
  role: ResearchThreadMessage["role"],
  content: string,
): ResearchThreadMessage {
  return { id, role, content, createdAt: "2026-09-04T12:00:00.000Z" };
}

function threadOperations(
  messages: ResearchThreadMessage[],
  committed: Parameters<ResearchThreadOperations["commitAnswer"]>[0][],
  append: () => void,
): ResearchThreadOperations {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected Research-thread operation");
  };
  return {
    create: unexpected,
    list: unexpected,
    async projectSelectedPath() {
      return {
        id: threadId,
        sourceId,
        stateId,
        componentIdentity: "active:/",
        componentLabel: "Main entry",
        title: "Temporary evidence inquiry",
        createdAt: "2026-09-04T12:00:00.000Z",
        updatedAt: "2026-09-04T12:00:00.000Z",
        messages,
      };
    },
    async appendQuestion() {
      append();
      return undefined;
    },
    async commitAnswer(input) {
      committed.push(input);
      return {
        id: input.answerMessageId,
        parentMessageId: input.questionMessageId,
        role: "assistant",
        content: input.content,
        model: input.model,
        references: input.references,
        createdAt: "2026-09-04T12:01:00.000Z",
      };
    },
    async historyThroughQuestion() {
      return messages;
    },
    async listChildren() {
      return [];
    },
    async selectAnswerAlternative() {
      return false;
    },
  };
}

async function collect(iterator: AsyncIterator<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of iterator) chunks.push(chunk);
  return chunks;
}
