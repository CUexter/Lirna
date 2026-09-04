import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { UIMessageChunk } from "ai";

import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import { createResearchTurnOperations } from "../../research-assistant/research-turn";
import {
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
import {
  answerId,
  BranchingThreads,
  followUpAnswerId,
  followUpQuestionId,
  questionId,
  siblingAnswerId,
  threadId,
} from "./sources-assistant-continuation.test-support";

test("restores and independently continues an existing answer branch", async () => {
  const threads = new BranchingThreads();
  const answerInputs: Parameters<ResearchAssistantOperations["answer"]>[0][] =
    [];
  const context = createTestContext({
    admittedSourceStates: admittedSourceStatesStub({
      async getReading() {
        return readingFixture();
      },
    }),
    researchThreads: threads,
    researchTurns: createResearchTurnOperations(
      managedResearchAssistant({
        async answer(input) {
          answerInputs.push(input);
          return evidenceStream();
        },
      }),
      threads,
    ),
  });

  await expect(
    call(
      sourcesRouter.assistant.ask,
      {
        sourceId,
        stateId,
        componentIdentity: "active:/",
        expectedSelectedLeafMessageId: answerId,
        question: "A stale follow-up",
        threadId,
      },
      { context },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message:
      "The selected Research-thread branch changed; reload and try again",
  });

  const restored = await call(
    sourcesRouter.assistant.selectAnswer,
    {
      sourceId,
      stateId,
      threadId,
      answerMessageId: answerId,
      expectedSelectedLeafMessageId: siblingAnswerId,
    },
    { context },
  );
  expect(restored.messages.map(({ id }) => id)).toEqual([
    questionId,
    answerId,
    followUpQuestionId,
    followUpAnswerId,
  ]);

  const stream = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      expectedSelectedLeafMessageId: followUpAnswerId,
      question: "How should this branch continue?",
      threadId,
    },
    { context },
  );
  await collect(stream);

  expect(answerInputs[0]?.history).toEqual([
    { role: "user", content: "What does the evidence establish?" },
    { role: "assistant", content: "The ancestor answer cites evidence." },
    { role: "user", content: "What follows from that answer?" },
    { role: "assistant", content: "The existing downstream answer." },
  ]);
  expect(JSON.stringify(answerInputs[0]?.history)).not.toContain(
    "unselected sibling",
  );
  const continuedLeafId = threads.selectedLeafId;
  const continued = await call(
    sourcesRouter.assistant.get,
    { sourceId, stateId, threadId },
    { context },
  );
  expect(continued.messages.slice(-2)).toMatchObject([
    {
      role: "user",
      parentMessageId: followUpAnswerId,
      content: "How should this branch continue?",
    },
    { id: continuedLeafId, role: "assistant" },
  ]);

  const sibling = await call(
    sourcesRouter.assistant.selectAnswer,
    {
      sourceId,
      stateId,
      threadId,
      answerMessageId: siblingAnswerId,
      expectedSelectedLeafMessageId: continuedLeafId,
    },
    { context },
  );
  expect(sibling.messages.at(-1)?.id).toBe(siblingAnswerId);
  const reopened = await call(
    sourcesRouter.assistant.selectAnswer,
    {
      sourceId,
      stateId,
      threadId,
      answerMessageId: answerId,
      expectedSelectedLeafMessageId: siblingAnswerId,
    },
    { context },
  );
  expect(reopened.messages.at(-1)?.id).toBe(continuedLeafId);
  expect(threads.messages).toContainEqual(
    expect.objectContaining({ id: siblingAnswerId }),
  );
  expect(threads.messages).not.toContainEqual(
    expect.objectContaining({ content: "A stale follow-up" }),
  );
});

async function collect(iterator: AsyncIterator<UIMessageChunk>) {
  while (!(await iterator.next()).done) {
    // Consume the answer so its atomic commit completes.
  }
}
