import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport, UIMessageChunk } from "ai";
import { createRef, useState } from "react";

import type {
  ResearchAssistantMessage,
  ResearchThread,
} from "../researchAssistantTransport";

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";
const firstAnswerId = "50000000-0000-4000-8000-000000000000";
const secondAnswerId = "60000000-0000-4000-8000-000000000000";
const downstreamQuestionId = "70000000-0000-4000-8000-000000000000";
const downstreamAnswerId = "80000000-0000-4000-8000-000000000000";
const selectionInputs: Array<{
  answerId: string;
  expectedSelectedLeafMessageId: string;
}> = [];
const askInputs: unknown[] = [];

mock.module("@/clients/inquiryClient", () => ({
  inquiryClient: {
    sources: {
      assistant: {
        ask: async (input: unknown) => {
          askInputs.push(input);
          return answerChunks();
        },
      },
    },
  },
}));

await mock.module("../hooks/useResearchThreads", () => ({
  useResearchThreads: () => {
    const [activeThread, setActiveThread] = useState(projectedThread(false));
    return {
      activeThread,
      activeThreadId: threadId,
      createRelated: async () => ({ status: "rejected" as const }),
      error: undefined,
      loading: false,
      resume: async () => {},
      selectAnswer: async (
        answerId: string,
        expectedSelectedLeafMessageId: string,
      ) => {
        selectionInputs.push({ answerId, expectedSelectedLeafMessageId });
        const selected = projectedThread(answerId === secondAnswerId);
        setActiveThread(selected);
        return selected;
      },
      startNew: () => {},
      threadCreated: async () => {},
      threads: [],
    };
  },
}));

const { createResearchAssistantTransport } = await import(
  "../researchAssistantTransport"
);
const { ReadingResearchAssistant } = await import("./ResearchAssistant");

afterEach(() => {
  askInputs.length = 0;
  selectionInputs.length = 0;
  cleanup();
});

test("restores a complete answer branch and submits beneath its leaf", async () => {
  const user = userEvent.setup();
  let sent:
    | Parameters<ChatTransport<ResearchAssistantMessage>["sendMessages"]>[0]
    | undefined;
  render(
    <ReadingResearchAssistant
      onClose={() => {}}
      open
      passageForReference={() => ({ show: () => {}, text: "Evidence" })}
      passageForSelection={() => ({ show: () => {}, text: "Evidence" })}
      reading={{
        componentIdentity: "active:/",
        componentLabel: "Main entry",
        plainText: "Synthetic reading text.",
        sourceId: "10000000-0000-4000-8000-000000000000",
        sourceTitle: "Test source",
        stateId: "20000000-0000-4000-8000-000000000000",
      }}
      transport={recordingTransport(
        (options) => {
          sent = options;
        },
        createResearchAssistantTransport({
          componentIdentity: "active:/",
          model: "z-ai/glm-5.3-flash",
          sourceId: "10000000-0000-4000-8000-000000000000",
          stateId: "20000000-0000-4000-8000-000000000000",
          threadId,
        }),
      )}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  expect(view().getByText("Existing downstream answer.")).toBeTruthy();
  await user.click(
    view().getByRole("button", { name: "Next answer alternative" }),
  );
  await waitFor(() =>
    expect(view().getByText("Second durable answer.")).toBeTruthy(),
  );
  expect(view().queryByText("Existing downstream answer.")).toBeNull();
  await user.click(
    view().getByRole("button", { name: "Previous answer alternative" }),
  );
  await waitFor(() =>
    expect(view().getByText("Existing downstream answer.")).toBeTruthy(),
  );

  expect(selectionInputs).toEqual([
    {
      answerId: secondAnswerId,
      expectedSelectedLeafMessageId: downstreamAnswerId,
    },
    {
      answerId: firstAnswerId,
      expectedSelectedLeafMessageId: secondAnswerId,
    },
  ]);
  expect(
    view().getByText("Existing downstream answer.").closest("[aria-live]"),
  ).toBeNull();

  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "Continue this restored branch",
  );
  await user.click(view().getByRole("button", { name: "Send question" }));
  await waitFor(() => expect(sent).toBeDefined());
  expect(sent?.messages.map(({ id }) => id)).toEqual([
    questionId,
    firstAnswerId,
    downstreamQuestionId,
    downstreamAnswerId,
    expect.any(String),
  ]);
  expect(sent?.messages.at(-1)?.parts).toContainEqual({
    type: "text",
    text: "Continue this restored branch",
  });
  expect(askInputs).toContainEqual(
    expect.objectContaining({
      expectedSelectedLeafMessageId: downstreamAnswerId,
      threadId,
    }),
  );
});

function recordingTransport(
  record: (
    options: Parameters<
      ChatTransport<ResearchAssistantMessage>["sendMessages"]
    >[0],
  ) => void,
  delegate: ChatTransport<ResearchAssistantMessage>,
): ChatTransport<ResearchAssistantMessage> {
  return {
    async sendMessages(options) {
      record(options);
      return delegate.sendMessages(options);
    },
    async reconnectToStream() {
      return null;
    },
  };
}

async function* answerChunks(): AsyncGenerator<UIMessageChunk> {
  yield { type: "start", messageId: "continued-answer" };
  yield { type: "text-start", id: "answer" };
  yield { type: "text-delta", id: "answer", delta: "A continued answer." };
  yield { type: "text-end", id: "answer" };
  yield { type: "finish", finishReason: "stop" };
}

function projectedThread(selectSecondAnswer: boolean): ResearchThread {
  const answerId = selectSecondAnswer ? secondAnswerId : firstAnswerId;
  return {
    id: threadId,
    sourceId: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Existing inquiry",
    createdAt: "2026-09-04T12:00:00.000Z",
    updatedAt: selectSecondAnswer
      ? "2026-09-04T12:04:00.000Z"
      : "2026-09-04T12:03:00.000Z",
    messages: [
      {
        id: questionId,
        role: "user",
        content: "What is the central claim?",
        createdAt: "2026-09-04T12:00:00.000Z",
      },
      {
        id: answerId,
        parentMessageId: questionId,
        role: "assistant",
        content: selectSecondAnswer
          ? "Second durable answer."
          : "First durable answer.",
        model: "z-ai/glm-5.3-flash",
        answerAlternatives: {
          position: selectSecondAnswer ? 2 : 1,
          total: 2,
          ...(selectSecondAnswer
            ? { previousAnswerId: firstAnswerId }
            : { nextAnswerId: secondAnswerId }),
        },
        createdAt: "2026-09-04T12:01:00.000Z",
      },
      ...(!selectSecondAnswer
        ? [
            {
              id: downstreamQuestionId,
              parentMessageId: firstAnswerId,
              role: "user" as const,
              content: "What follows from this answer?",
              createdAt: "2026-09-04T12:02:00.000Z",
            },
            {
              id: downstreamAnswerId,
              parentMessageId: downstreamQuestionId,
              role: "assistant" as const,
              content: "Existing downstream answer.",
              model: "z-ai/glm-5.3-flash" as const,
              createdAt: "2026-09-04T12:03:00.000Z",
            },
          ]
        : []),
    ],
  };
}

function view() {
  return within(document.body);
}
