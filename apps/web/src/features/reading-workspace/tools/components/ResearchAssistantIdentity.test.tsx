import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport } from "ai";
import { createRef } from "react";

import type {
  ResearchAssistantMessage,
  ResearchThread,
} from "../researchAssistantTransport";

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";
let durableThread: ResearchThread | undefined;
let loadedThreadId: string | undefined;

await mock.module("@/clients/inquiryClient", () => ({
  inquiryClient: {
    sources: {
      assistant: {
        async get(input: { threadId: string }) {
          loadedThreadId = input.threadId;
          return durableThread;
        },
        async list() {
          return durableThread ? [durableThread] : [];
        },
      },
    },
  },
}));

const { ReadingResearchAssistant } = await import("./ResearchAssistant");

afterEach(() => {
  cleanup();
  durableThread = undefined;
  loadedThreadId = undefined;
});

test("keeps a streamed answer identity through the real reload path", async () => {
  const user = userEvent.setup();
  const transport: ChatTransport<ResearchAssistantMessage> = {
    async sendMessages() {
      const answerId = crypto.randomUUID();
      durableThread = thread(answerId);
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start", messageId: answerId });
          controller.enqueue({ type: "text-start", id: "answer-text" });
          controller.enqueue({
            type: "text-delta",
            id: "answer-text",
            delta: "One durable answer.",
          });
          controller.enqueue({ type: "text-end", id: "answer-text" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
  const live = renderAssistant(transport);

  await user.type(view().getByLabelText("Question"), "What lasts?");
  await user.click(view().getByRole("button", { name: "Send question" }));
  const liveAnswer = await waitFor(() =>
    view().getByText("One durable answer."),
  );
  const liveAnswerId = messageId(liveAnswer);
  expect(liveAnswerId).toEqual(expect.any(String));

  live.unmount();
  renderAssistant();

  const reloadedAnswer = await waitFor(() =>
    view().getByText("One durable answer."),
  );
  expect(loadedThreadId).toBe(threadId);
  expect(messageId(reloadedAnswer)).toBe(liveAnswerId);
});

function renderAssistant(transport?: ChatTransport<ResearchAssistantMessage>) {
  return render(
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
        plainText: "Durable evidence.",
        sourceId: "10000000-0000-4000-8000-000000000000",
        sourceTitle: "Durable answers",
        stateId: "20000000-0000-4000-8000-000000000000",
      }}
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );
}

function thread(answerId: string): ResearchThread {
  return {
    id: threadId,
    sourceId: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "What lasts?",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:01:00.000Z",
    messages: [
      {
        id: questionId,
        role: "user",
        content: "What lasts?",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: answerId,
        role: "assistant",
        content: "One durable answer.",
        createdAt: "2026-09-01T12:01:00.000Z",
      },
    ],
  };
}

function messageId(element: HTMLElement) {
  return element.closest("[data-message-id]")?.getAttribute("data-message-id");
}

function view() {
  return within(document.body);
}
