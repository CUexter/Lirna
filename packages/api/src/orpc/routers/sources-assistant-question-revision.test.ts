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
const originalQuestionId = "40000000-0000-4000-8000-000000000000";
const originalAnswerId = "50000000-0000-4000-8000-000000000000";
const followUpQuestionId = "60000000-0000-4000-8000-000000000000";
const followUpAnswerId = "70000000-0000-4000-8000-000000000000";
const attachment = {
  dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
  filename: "evidence.txt",
  mediaType: "text/plain" as const,
  size: 18,
};

test("creates a selected immutable revision before generation and retries a failed answer", async () => {
  const threads = new RevisionThreads();
  const answerInputs: Parameters<ResearchAssistantOperations["answer"]>[0][] =
    [];
  let attempt = 0;
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
        evidenceSnapshot({ sessionId: `revision-session-${attempt}` }),
      ).answer(input, options);
    },
  };
  const context = testContext(threads, assistant);

  const revisedThread = await call(
    sourcesRouter.assistant.reviseQuestion,
    revisionInput(),
    { context },
  );
  const revised = revisedThread.messages.at(-1);
  expect(revised).toMatchObject({
    originMessageId: originalQuestionId,
    role: "user",
    content: "What does the revised evidence establish?",
    selectedText: "Verified passage.",
    temporaryEvidence: [
      { filename: attachment.filename, mediaType: attachment.mediaType },
    ],
  });
  expect(threads.messages).toHaveLength(5);
  expect(threads.messages.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      originalQuestionId,
      originalAnswerId,
      followUpQuestionId,
      followUpAnswerId,
    ]),
  );

  const first = await call(
    sourcesRouter.assistant.retry,
    retryInput(revised?.id),
    { context },
  );
  expect(await collect(first)).toEqual([
    expect.objectContaining({ type: "error" }),
  ]);
  expect(threads.selectedLeafId).toBe(revised?.id);
  expect(
    threads.messages.filter(
      ({ parentMessageId }) => parentMessageId === revised?.id,
    ),
  ).toHaveLength(0);

  const second = await call(
    sourcesRouter.assistant.retry,
    retryInput(revised?.id),
    { context },
  );
  expect(await collect(second)).toContainEqual(
    expect.objectContaining({ type: "text-delta" }),
  );
  expect(answerInputs).toHaveLength(2);
  expect(answerInputs[1]).toMatchObject({
    question: "What does the revised evidence establish?",
    selectedText: "Verified passage.",
    history: [],
    attachments: [
      {
        data: new URL(attachment.dataUrl),
        filename: attachment.filename,
        mediaType: attachment.mediaType,
      },
    ],
  });
  expect(threads.messages.at(-1)).toMatchObject({
    role: "assistant",
    parentMessageId: revised?.id,
    references: [
      expect.objectContaining({
        selection: expect.objectContaining({ exactText: "Verified passage." }),
      }),
    ],
  });
});

test("rejects missing temporary evidence and stale selection before revision", async () => {
  const threads = new RevisionThreads();
  const context = testContext(threads, managedResearchAssistant());
  await expect(
    call(
      sourcesRouter.assistant.reviseQuestion,
      { ...revisionInput(), attachments: undefined },
      { context },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message:
      "Reattach temporary evidence before regenerating from the revised question: evidence.txt (text/plain)",
  });
  expect(threads.revisionAttempts).toBe(0);
  expect(threads.messages).toHaveLength(4);
  await expect(
    call(
      sourcesRouter.assistant.reviseQuestion,
      {
        ...revisionInput(),
        attachments: [{ ...attachment, dataUrl: "data:text/plain;base64,%%%" }],
      },
      { context },
    ),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Attachment evidence.txt has invalid size metadata",
  });
  expect(threads.revisionAttempts).toBe(0);
  expect(threads.messages).toHaveLength(4);

  const concurrentLeafId = "80000000-0000-4000-8000-000000000000";
  threads.messages.push(
    message(concurrentLeafId, "assistant", "Concurrent answer", {
      parentMessageId: originalQuestionId,
      model: "z-ai/glm-5.3-flash",
    }),
  );
  threads.selectedLeafId = concurrentLeafId;
  await expect(
    call(sourcesRouter.assistant.reviseQuestion, revisionInput(), { context }),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message:
      "The selected Research-thread branch changed; reload and try again",
  });
  expect(threads.messages).toHaveLength(5);
});

class RevisionThreads implements ResearchThreadOperations {
  selectedLeafId = followUpAnswerId;
  revisionAttempts = 0;
  messages: ResearchThreadMessage[] = [
    message(originalQuestionId, "user", "What does the evidence establish?", {
      selectedText: "Verified passage.",
      temporaryEvidence: [
        { filename: attachment.filename, mediaType: attachment.mediaType },
      ],
    }),
    message(originalAnswerId, "assistant", "Original answer", {
      parentMessageId: originalQuestionId,
      model: "z-ai/glm-5.3-flash",
    }),
    message(followUpQuestionId, "user", "Original follow-up", {
      parentMessageId: originalAnswerId,
    }),
    message(followUpAnswerId, "assistant", "Original downstream answer", {
      parentMessageId: followUpQuestionId,
      model: "z-ai/glm-5.3-flash",
    }),
  ];

  async projectSelectedPath() {
    return { ...thread(), messages: this.pathThrough(this.selectedLeafId) };
  }

  async reviseQuestion(
    input: Parameters<ResearchThreadOperations["reviseQuestion"]>[0],
  ) {
    this.revisionAttempts += 1;
    if (this.selectedLeafId !== input.expectedSelectedLeafMessageId)
      return undefined;
    const original = this.messages.find(
      ({ id, role }) => id === input.questionMessageId && role === "user",
    );
    if (!original) return undefined;
    const revised = message(crypto.randomUUID(), "user", input.content, {
      originMessageId: original.id,
      parentMessageId: original.parentMessageId,
      selectedText: original.selectedText,
      temporaryEvidence: original.temporaryEvidence,
    });
    this.messages.push(revised);
    this.selectedLeafId = revised.id;
    return revised;
  }

  async commitAnswer(
    input: Parameters<ResearchThreadOperations["commitAnswer"]>[0],
  ) {
    const answer = message(input.answerMessageId, "assistant", input.content, {
      parentMessageId: input.questionMessageId,
      model: input.model,
      references: input.references,
    });
    this.messages.push(answer);
    if (this.selectedLeafId === input.expectedSelectedLeafMessageId)
      this.selectedLeafId = answer.id;
    return answer;
  }

  async historyThroughQuestion({
    questionMessageId,
  }: {
    questionMessageId: string;
  }) {
    return this.pathThrough(questionMessageId);
  }

  async listChildren({ parentMessageId }: { parentMessageId?: string }) {
    return this.messages.filter(
      (candidate) => candidate.parentMessageId === parentMessageId,
    );
  }

  async create(): Promise<never> {
    throw new Error("Unexpected create");
  }
  async list() {
    return [];
  }
  async lineage() {
    return { relatedThreads: [] };
  }
  async appendQuestion(): Promise<never> {
    throw new Error("Unexpected append");
  }
  async selectAnswerAlternative() {
    return false;
  }
  async selectQuestionAlternative() {
    return false;
  }
  async createRelatedThread(): Promise<never> {
    throw new Error("Unexpected related thread");
  }

  private pathThrough(leafId: string) {
    const byId = new Map(
      this.messages.map((candidate) => [candidate.id, candidate]),
    );
    const path: ResearchThreadMessage[] = [];
    let current = byId.get(leafId);
    while (current) {
      path.push(current);
      current = current.parentMessageId
        ? byId.get(current.parentMessageId)
        : undefined;
    }
    return path.reverse();
  }
}

function testContext(
  threads: RevisionThreads,
  assistant: ResearchAssistantOperations,
) {
  return createTestContext({
    admittedSourceStates: admittedSourceStatesStub({
      async getReading() {
        return readingFixture();
      },
    }),
    researchThreads: threads,
    researchTurns: createResearchTurnOperations(assistant, threads),
  });
}

function revisionInput() {
  return {
    sourceId,
    stateId,
    threadId,
    questionMessageId: originalQuestionId,
    expectedSelectedLeafMessageId: followUpAnswerId,
    question: "What does the revised evidence establish?",
    attachments: [attachment],
  };
}

function retryInput(questionMessageId: string | undefined) {
  return {
    sourceId,
    stateId,
    threadId,
    questionMessageId: questionMessageId ?? "missing",
    attachments: [attachment],
  };
}

function message(
  id: string,
  role: ResearchThreadMessage["role"],
  content: string,
  metadata: Partial<ResearchThreadMessage> = {},
): ResearchThreadMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-09-05T12:00:00.000Z",
    ...metadata,
  };
}

function thread() {
  return {
    id: threadId,
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Revision inquiry",
    createdAt: "2026-09-05T12:00:00.000Z",
    updatedAt: "2026-09-05T12:00:00.000Z",
  };
}

async function collect(iterator: AsyncIterator<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of iterator) chunks.push(chunk);
  return chunks;
}
