import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";
import { createResearchTurnOperations } from "./research-turn";
import {
  answerStream,
  assistant,
  collect,
  evidenceSnapshot,
  evidenceStream,
  input,
  managedResearchAssistant,
  multiStepStream,
  type RecordedAnswer,
  recordingThreads,
} from "./research-turn.test-support";

const threadId = "30000000-0000-4000-8000-000000000000";

test("allocates the durable answer identity before model streaming begins", async () => {
  let identityAvailableAtStart: string | undefined;
  const appended: RecordedAnswer[] = [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const turns = createResearchTurnOperations(
    managedResearchAssistant({
      async answer(_input, options) {
        identityAvailableAtStart = options?.commit?.answerMessageId;
        return answerStream("Completed answer");
      },
    }),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    }),
  );

  expect(identityAvailableAtStart).toEqual(expect.any(String));
  expect(chunks[0]).toEqual({
    type: "start",
    messageId: identityAvailableAtStart,
  });
  expect(appended[0]?.answerMessageId).toBe(identityAvailableAtStart);
  expect(receipts[0]?.attemptedAnswerMessageId).toBe(identityAvailableAtStart);
});

test("streams Markdown and commits its compiled References together", async () => {
  const appended: RecordedAnswer[] = [];
  const turns = createResearchTurnOperations(
    assistant(evidenceStream()),
    recordingThreads(appended),
  );

  const chunks = await collect(await turns.answer(input()));
  const start = chunks.find((chunk) => chunk.type === "start");

  expect(start).toMatchObject({ type: "start", messageId: expect.any(String) });
  expect(chunks).toContainEqual({
    type: "text-delta",
    id: "assistant-text",
    delta: "The passage grounds this claim.[^ev_1]",
  });
  expect(appended).toMatchObject([
    {
      threadId,
      questionMessageId: "40000000-0000-4000-8000-000000000000",
      answerMessageId:
        start?.type === "start" ? start.messageId : "missing-answer-id",
      model: "z-ai/glm-5.3-flash",
      role: "assistant",
      content: expect.stringMatching(
        /^The passage grounds this claim\.\[\^[\da-f-]{36}\]$/,
      ),
      references: [
        {
          id: "10000000-0000-4000-8000-000000000000",
          componentIdentity: "active:/",
          selection: { exactText: "Verified passage." },
          occurrences: [
            {
              id: expect.any(String),
              presentation: "passing",
              relation: "supports",
            },
          ],
        },
      ],
    },
  ]);
});

test("commits only final synthesis Markdown from a multi-step turn", async () => {
  const appended: RecordedAnswer[] = [];
  const turns = createResearchTurnOperations(
    assistant(multiStepStream()),
    recordingThreads(appended),
  );

  await collect(await turns.answer(input()));

  expect(appended).toMatchObject([
    {
      role: "assistant",
      content: "## Grounded connection",
    },
  ]);
});

test("rejects final synthesis when its transient claim ledger is missing", async () => {
  const appended: RecordedAnswer[] = [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const turns = createResearchTurnOperations(
    assistant(
      answerStream("Unsupported answer", true, "stop", false),
      evidenceSnapshot(),
    ),
    recordingThreads(appended),
  );

  const chunks = await collect(
    await turns.answer(input(), {
      onError: (error) => `Failed: ${(error as Error).message}`,
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    }),
  );

  expect(appended).toEqual([]);
  expect(chunks.at(-1)).toEqual({
    type: "error",
    errorText:
      "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.",
  });
  expect(receipts).toMatchObject([
    {
      outcome: "invalid-answer",
      terminalReasonCode: "answer-validation-failed",
      questionMessageId: input().questionMessageId,
      attemptedAnswerMessageId: expect.any(String),
    },
  ]);
});

test("reports successful, refused, and exhausted sessions without content", async () => {
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  for (const snapshot of [
    evidenceSnapshot(),
    evidenceSnapshot({
      admittedCount: 0,
      refusedCount: 1,
      reasonCodes: ["scope-denied"],
    }),
    evidenceSnapshot({
      budgetExhausted: true,
      reasonCodes: ["model-step-budget-exhausted"],
    }),
  ]) {
    const turns = createResearchTurnOperations(
      assistant(answerStream("Completed answer"), snapshot),
      recordingThreads([]),
    );
    await collect(
      await turns.answer(input(), {
        onEvidenceSessionReceipt(receipt) {
          receipts.push(receipt);
        },
      }),
    );
  }

  expect(receipts.map(({ outcome }) => outcome)).toEqual([
    "successful",
    "refused",
    "exhausted",
  ]);
  expect(receipts[0]).toMatchObject({
    sessionId: "session-test",
    researchThreadId: threadId,
    questionMessageId: "40000000-0000-4000-8000-000000000000",
    attemptedAnswerMessageId: expect.any(String),
    sourceStateId: "state-one",
    resolverVersion: "lexical-v1",
    indexVersion: "reading-components-v1",
    budget: expect.any(Object),
    consumption: expect.any(Object),
    candidateCount: 1,
    latencyBucket: expect.any(String),
  });
  expect(JSON.stringify(receipts)).not.toContain("What is the central claim?");
  expect(JSON.stringify(receipts)).not.toContain("Completed answer");
  expect(JSON.stringify(receipts)).not.toContain("Verified passage");
  expect(
    receipts.every(
      (receipt) => receipt.questionMessageId === input().questionMessageId,
    ),
  ).toBe(true);
  expect(
    receipts.every((receipt) => Boolean(receipt.attemptedAnswerMessageId)),
  ).toBe(true);
});

test("cancelling a turn cancels model execution and commits no answer", async () => {
  let modelCancelled = false;
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const appended: RecordedAnswer[] = [];
  const modelStream = new ReadableStream<UIMessageChunk>({
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
  const turns = createResearchTurnOperations(
    assistant(modelStream, evidenceSnapshot()),
    recordingThreads(appended),
  );
  const reader = (
    await turns.answer(input(), {
      onEvidenceSessionReceipt: (receipt) => receipts.push(receipt),
    })
  ).getReader();

  const first = await reader.read();
  await reader.cancel("client disconnected");

  expect(modelCancelled).toBe(true);
  expect(appended).toEqual([]);
  expect(first.value).toMatchObject({
    type: "start",
    messageId: receipts[0]?.attemptedAnswerMessageId,
  });
  expect(receipts).toMatchObject([
    {
      outcome: "cancelled",
      questionMessageId: input().questionMessageId,
    },
  ]);
});
