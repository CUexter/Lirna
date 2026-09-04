import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { UIMessageChunk } from "ai";

import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import type {
  ResearchThreadMessage,
  ResearchThreadOperations,
} from "../../research-assistant/research-thread-contract";
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

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";
const originalAnswerId = "50000000-0000-4000-8000-000000000000";
const concurrentAnswerId = "60000000-0000-4000-8000-000000000000";
const attachment = {
  dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
  filename: "evidence.txt",
  mediaType: "text/plain" as const,
  size: 18,
};

test("regenerates the durable question and selects immutable answer alternatives", async () => {
  const threads = new MemoryThreads(true);
  const answerInputs: Parameters<ResearchAssistantOperations["answer"]>[0][] =
    [];
  const context = testContext(threads, {
    async answer(input) {
      answerInputs.push(input);
      return evidenceStream();
    },
  });

  const stream = await call(
    sourcesRouter.assistant.regenerate,
    regenerateInput(originalAnswerId),
    { context },
  );
  await collect(stream);

  expect(threads.messages).toHaveLength(3);
  expect(threads.messages.filter(({ role }) => role === "user")).toHaveLength(
    1,
  );
  const regenerated = threads.messages.at(-1);
  expect(regenerated).toMatchObject({
    role: "assistant",
    parentMessageId: questionId,
    regeneratedFromAnswerId: originalAnswerId,
    model: "z-ai/glm-5.3-flash",
  });
  expect(regenerated?.references?.[0]?.selection.exactText).toBe(
    "Verified passage.",
  );
  expect(threads.messages[1]).toEqual(originalAnswer());
  expect(answerInputs[0]).toMatchObject({
    question: "What does the evidence establish?",
    attachments: [
      {
        data: new URL(attachment.dataUrl),
        filename: attachment.filename,
        mediaType: attachment.mediaType,
      },
    ],
  });

  const selectedOriginal = await call(
    sourcesRouter.assistant.selectAnswer,
    {
      sourceId,
      stateId,
      threadId,
      answerMessageId: originalAnswerId,
      expectedSelectedLeafMessageId: regenerated?.id ?? "missing",
    },
    { context },
  );
  expect(selectedOriginal.messages.at(-1)?.id).toBe(originalAnswerId);
  const selectedRegenerated = await call(
    sourcesRouter.assistant.selectAnswer,
    {
      sourceId,
      stateId,
      threadId,
      answerMessageId: regenerated?.id ?? "missing",
      expectedSelectedLeafMessageId: originalAnswerId,
    },
    { context },
  );
  expect(selectedRegenerated.messages.at(-1)?.id).toBe(regenerated?.id);
  const reopened = await call(
    sourcesRouter.assistant.get,
    { sourceId, stateId, threadId },
    { context },
  );
  expect(reopened.messages.at(-1)?.id).toBe(regenerated?.id);
});

test("retains a stale completed regeneration without replacing a newer selection", async () => {
  const threads = new MemoryThreads(false);
  threads.messages.push({
    ...originalAnswer(),
    id: concurrentAnswerId,
    content: "A concurrently selected answer.",
  });
  const context = testContext(threads, {
    async answer() {
      return evidenceStream();
    },
  });
  const stream = await call(
    sourcesRouter.assistant.regenerate,
    regenerateInput(originalAnswerId, false),
    { context },
  );
  threads.selectedLeafId = concurrentAnswerId;
  await collect(stream);

  expect(threads.messages).toHaveLength(4);
  expect(threads.messages.at(-1)).toMatchObject({
    regeneratedFromAnswerId: originalAnswerId,
  });
  const reopened = await call(
    sourcesRouter.assistant.get,
    { sourceId, stateId, threadId },
    { context },
  );
  expect(reopened.messages.at(-1)?.id).toBe(concurrentAnswerId);
});

test("rejects attachment-backed regeneration before starting without reattachment", async () => {
  const threads = new MemoryThreads(true);
  let started = false;
  await expect(
    call(
      sourcesRouter.assistant.regenerate,
      regenerateInput(originalAnswerId, false),
      {
        context: testContext(threads, {
          async answer() {
            started = true;
            return evidenceStream();
          },
        }),
      },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message:
      "Reattach temporary evidence before regenerating: evidence.txt (text/plain)",
  });
  expect(started).toBe(false);
  expect(threads.messages).toHaveLength(2);
  expect(threads.selectedLeafId).toBe(originalAnswerId);
});

test("rejects a cross-scope selection before changing the selected path", async () => {
  const threads = new MemoryThreads(false);
  await expect(
    call(
      sourcesRouter.assistant.selectAnswer,
      {
        sourceId,
        stateId: "70000000-0000-4000-8000-000000000000",
        threadId,
        answerMessageId: originalAnswerId,
        expectedSelectedLeafMessageId: originalAnswerId,
      },
      { context: testContext(threads, managedResearchAssistant()) },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(threads.selectedLeafId).toBe(originalAnswerId);
  expect(threads.selectionAttempts).toBe(0);
});

test("does not add an alternative when regeneration fails to start", async () => {
  const threads = new MemoryThreads(false);
  await expect(
    call(
      sourcesRouter.assistant.regenerate,
      regenerateInput(originalAnswerId, false),
      {
        context: testContext(threads, {
          async answer() {
            throw new Error("Model unavailable");
          },
        }),
      },
    ),
  ).rejects.toThrow("Model unavailable");
  expect(threads.messages).toHaveLength(2);
  expect(threads.selectedLeafId).toBe(originalAnswerId);
});

class MemoryThreads implements ResearchThreadOperations {
  messages: ResearchThreadMessage[];
  selectedLeafId = originalAnswerId;
  selectionAttempts = 0;

  constructor(withTemporaryEvidence: boolean) {
    this.messages = [question(withTemporaryEvidence), originalAnswer()];
  }

  async projectSelectedPath(input?: { sourceId?: string; stateId?: string }) {
    if (
      (input?.sourceId && input.sourceId !== sourceId) ||
      (input?.stateId && input.stateId !== stateId)
    )
      return null;
    const byId = new Map(this.messages.map((message) => [message.id, message]));
    const path: ResearchThreadMessage[] = [];
    let current = byId.get(this.selectedLeafId);
    while (current) {
      path.push(current);
      current = current.parentMessageId
        ? byId.get(current.parentMessageId)
        : undefined;
    }
    return { ...thread(), messages: path.reverse() };
  }

  async commitAnswer(
    input: Parameters<ResearchThreadOperations["commitAnswer"]>[0],
  ) {
    const answer: ResearchThreadMessage = {
      id: input.answerMessageId,
      parentMessageId: input.questionMessageId,
      role: "assistant",
      content: input.content,
      model: input.model,
      regeneratedFromAnswerId: input.regeneratedFromAnswerId,
      references: input.references,
      createdAt: "2026-09-04T12:02:00.000Z",
    };
    this.messages.push(answer);
    if (this.selectedLeafId === input.expectedSelectedLeafMessageId)
      this.selectedLeafId = answer.id;
    return answer;
  }

  async historyThroughQuestion() {
    return [question(false)];
  }
  async listChildren({ parentMessageId }: { parentMessageId?: string }) {
    return this.messages.filter(
      (message) => message.parentMessageId === parentMessageId,
    );
  }
  async selectAnswerAlternative(
    input: Parameters<ResearchThreadOperations["selectAnswerAlternative"]>[0],
  ) {
    this.selectionAttempts += 1;
    if (this.selectedLeafId !== input.expectedSelectedLeafMessageId)
      return false;
    const answer = this.messages.find(
      ({ id, role }) => id === input.answerMessageId && role === "assistant",
    );
    if (!answer) return false;
    this.selectedLeafId = answer.id;
    return true;
  }
  async create(): Promise<never> {
    throw new Error("Unexpected create");
  }
  async list() {
    return [];
  }
  async appendQuestion(): Promise<never> {
    throw new Error("Unexpected append");
  }
}

function testContext(
  threads: MemoryThreads,
  assistant: ResearchAssistantOperations,
) {
  return createTestContext(
    {
      admittedSourceStates: admittedSourceStatesStub({
        async getReading() {
          return readingFixture();
        },
      }),
      researchThreads: threads,
      researchTurns: createResearchTurnOperations(
        managedResearchAssistant(assistant),
        threads,
      ),
    },
    { debugErrors: true },
  );
}

function regenerateInput(answerMessageId: string, attachments = true) {
  return {
    sourceId,
    stateId,
    threadId,
    answerMessageId,
    expectedSelectedLeafMessageId: originalAnswerId,
    ...(attachments ? { attachments: [attachment] } : {}),
  };
}

function question(withTemporaryEvidence: boolean): ResearchThreadMessage {
  return {
    id: questionId,
    role: "user",
    content: "What does the evidence establish?",
    ...(withTemporaryEvidence
      ? {
          temporaryEvidence: [
            { filename: attachment.filename, mediaType: attachment.mediaType },
          ],
        }
      : {}),
    createdAt: "2026-09-04T12:00:00.000Z",
  };
}

function originalAnswer(): ResearchThreadMessage {
  return {
    id: originalAnswerId,
    parentMessageId: questionId,
    role: "assistant",
    content: "The original answer.",
    model: "z-ai/glm-5.3-flash",
    references: [],
    createdAt: "2026-09-04T12:01:00.000Z",
  };
}

function thread() {
  return {
    id: threadId,
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Evidence inquiry",
    createdAt: "2026-09-04T12:00:00.000Z",
    updatedAt: "2026-09-04T12:00:00.000Z",
  };
}

async function collect(iterator: AsyncIterator<UIMessageChunk>) {
  while (!(await iterator.next()).done) {
    // Consume the answer so its atomic commit completes.
  }
}
