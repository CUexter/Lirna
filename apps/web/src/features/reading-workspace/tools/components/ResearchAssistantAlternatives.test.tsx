import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
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
let attachmentBacked = false;

await mock.module("../hooks/useResearchThreads", () => ({
  useResearchThreads: () => {
    const [activeThread, setActiveThread] = useState(
      projectedThread(firstAnswerId, attachmentBacked),
    );
    return {
      activeThread,
      activeThreadId: threadId,
      error: undefined,
      loading: false,
      resume: async () => {},
      selectAnswer: async (answerId: string) => {
        const selected = projectedThread(answerId, attachmentBacked);
        setActiveThread(selected);
        return selected;
      },
      startNew: () => {},
      threadCreated: async () => {},
      threads: [],
    };
  },
}));

const { ReadingResearchAssistant } = await import("./ResearchAssistant");

afterEach(() => {
  attachmentBacked = false;
  cleanup();
});

test("regenerates a completed answer and navigates alternatives with labelled controls", async () => {
  const user = userEvent.setup();
  let sent:
    | Parameters<ChatTransport<ResearchAssistantMessage>["sendMessages"]>[0]
    | undefined;
  renderAssistant(
    transport((options) => {
      sent = options;
    }),
  );

  expect(view().getByText("First durable answer.")).toBeTruthy();
  expect(view().getByText("Answer 1 of 2")).toBeTruthy();
  expect(view().getAllByText("GLM 5.3 Flash")).toHaveLength(2);
  expect(
    view().getByRole("group", { name: "Answer alternatives" }),
  ).toBeTruthy();

  const nextAlternative = view().getByRole("button", {
    name: "Next answer alternative",
  });
  nextAlternative.focus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(view().getByText("Second durable answer.")).toBeTruthy(),
  );
  expect(view().getByText("Answer 2 of 2")).toBeTruthy();
  await user.click(
    view().getByRole("button", { name: "Previous answer alternative" }),
  );
  await waitFor(() =>
    expect(view().getByText("First durable answer.")).toBeTruthy(),
  );

  await user.click(view().getByRole("button", { name: "Regenerate answer" }));
  await waitFor(() => expect(sent).toBeDefined());
  expect(sent).toMatchObject({
    trigger: "regenerate-message",
    messageId: firstAnswerId,
    body: {
      operation: "regenerate",
      attachments: [],
      expectedSelectedLeafMessageId: firstAnswerId,
    },
    messages: [expect.objectContaining({ id: questionId, role: "user" })],
  });
  await waitFor(() =>
    expect(view().getByText("A regenerated answer.")).toBeTruthy(),
  );
});

test("requires temporary evidence to be reattached before regeneration", async () => {
  attachmentBacked = true;
  const user = userEvent.setup();
  let sent = false;
  renderAssistant(
    transport(() => {
      sent = true;
    }),
  );

  await user.click(view().getByRole("button", { name: "Regenerate answer" }));
  expect(sent).toBe(false);
  expect(view().getByRole("alert").textContent).toContain(
    "Reattach temporary evidence before regenerating: evidence.txt (text/plain)",
  );

  await act(async () => {
    await user.upload(
      view().getByLabelText("Attach files"),
      new File(["temporary evidence"], "evidence.txt", {
        type: "text/plain",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await user.click(view().getByRole("button", { name: "Regenerate answer" }));
  await waitFor(() => expect(sent).toBe(true));
});

function transport(
  record: (
    options: Parameters<
      ChatTransport<ResearchAssistantMessage>["sendMessages"]
    >[0],
  ) => void,
): ChatTransport<ResearchAssistantMessage> {
  return {
    async sendMessages(options) {
      record(options);
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: "start",
            messageId: "regenerated-answer",
          });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "A regenerated answer.",
          });
          controller.enqueue({ type: "text-end", id: "answer" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function renderAssistant(
  chatTransport: ChatTransport<ResearchAssistantMessage>,
) {
  render(
    <ReadingResearchAssistant
      onClose={() => {}}
      open
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      reading={{
        componentIdentity: "active:/",
        componentLabel: "Main entry",
        plainText: "Synthetic reading text.",
        sourceId: "10000000-0000-4000-8000-000000000000",
        sourceTitle: "Test source",
        stateId: "20000000-0000-4000-8000-000000000000",
      }}
      transport={chatTransport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );
}

function projectedThread(
  answerId: string,
  withAttachment: boolean,
): ResearchThread {
  const second = answerId === secondAnswerId;
  return {
    id: threadId,
    sourceId: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Existing inquiry",
    createdAt: "2026-09-04T12:00:00.000Z",
    updatedAt: second ? "2026-09-04T12:02:00.000Z" : "2026-09-04T12:01:00.000Z",
    messages: [
      {
        id: questionId,
        role: "user",
        content: "What is the central claim?",
        ...(withAttachment
          ? {
              temporaryEvidence: [
                { filename: "evidence.txt", mediaType: "text/plain" },
              ],
            }
          : {}),
        createdAt: "2026-09-04T12:00:00.000Z",
      },
      {
        id: answerId,
        parentMessageId: questionId,
        role: "assistant",
        content: second ? "Second durable answer." : "First durable answer.",
        model: "z-ai/glm-5.3-flash",
        answerAlternatives: {
          position: second ? 2 : 1,
          total: 2,
          ...(second
            ? { previousAnswerId: firstAnswerId }
            : { nextAnswerId: secondAnswerId }),
        },
        createdAt: second
          ? "2026-09-04T12:02:00.000Z"
          : "2026-09-04T12:01:00.000Z",
      },
    ],
  };
}

function view() {
  return within(document.body);
}
