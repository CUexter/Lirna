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
const answerId = "50000000-0000-4000-8000-000000000000";
const revisedQuestionId = "60000000-0000-4000-8000-000000000000";
let revisionInputs: unknown[] = [];
let attachmentBacked = false;

await mock.module("../hooks/useResearchThreads", () => ({
  useResearchThreads: () => {
    const [activeThread, setActiveThread] = useState(originalThread());
    return {
      activeThread,
      activeThreadId: threadId,
      error: undefined,
      loading: false,
      lineage: undefined,
      reviseQuestion: async (...input: unknown[]) => {
        revisionInputs.push(input);
        const revised = revisedThread(input[2] as string);
        setActiveThread(revised);
        return revised;
      },
      selectQuestion: async () => undefined,
      selectAnswer: async () => undefined,
      createRelated: async () => ({ status: "indeterminate" as const }),
      resume: async () => {},
      resumeSourceAnswer: async () => {},
      startNew: () => {},
      threadCreated: async () => {},
      threads: [],
    };
  },
}));

const { ReadingResearchAssistant } = await import("./ResearchAssistant");

afterEach(() => {
  revisionInputs = [];
  attachmentBacked = false;
  cleanup();
});

test("revises the durable question before retrying generation from it", async () => {
  attachmentBacked = true;
  const user = userEvent.setup();
  let sent:
    | Parameters<ChatTransport<ResearchAssistantMessage>["sendMessages"]>[0]
    | undefined;
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
      transport={transport((options) => {
        sent = options;
      })}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  await user.click(view().getByRole("button", { name: "Edit question" }));
  const editor = view().getByRole("textbox", { name: "Revised question" });
  await user.clear(editor);
  await user.type(editor, "What does the revised evidence establish?");
  await user.click(
    view().getByRole("button", { name: "Regenerate from here" }),
  );
  expect(revisionInputs).toEqual([]);
  expect(view().getByRole("alert").textContent).toContain(
    "Reattach temporary evidence before regenerating from the revised question: evidence.txt (text/plain)",
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
  await user.click(
    view().getByRole("button", { name: "Regenerate from here" }),
  );

  await waitFor(() => expect(revisionInputs).toHaveLength(1));
  expect(revisionInputs[0]).toEqual([
    questionId,
    answerId,
    "What does the revised evidence establish?",
    [
      {
        dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
        filename: "evidence.txt",
        mediaType: "text/plain",
        size: 18,
      },
    ],
  ]);
  await waitFor(() => expect(sent).toBeDefined());
  expect(sent).toMatchObject({
    trigger: "regenerate-message",
    messageId: revisedQuestionId,
    body: {
      operation: "retry",
      attachments: [expect.objectContaining({ filename: "evidence.txt" })],
    },
  });
  await waitFor(() =>
    expect(
      view().getByText("What does the revised evidence establish?"),
    ).toBeTruthy(),
  );
});

test("keeps a failed revised question selected and retries it", async () => {
  const user = userEvent.setup();
  let attempt = 0;
  renderAssistant({
    async sendMessages() {
      attempt += 1;
      if (attempt === 1)
        return new ReadableStream<UIMessageChunk>({
          pull(controller) {
            controller.error(new Error("Provider unavailable"));
          },
        });
      return answerStream();
    },
    async reconnectToStream() {
      return null;
    },
  });
  await submitRevision(user, "Revision that initially fails");
  await waitFor(() =>
    expect(view().getByRole("button", { name: "Retry answer" })).toBeTruthy(),
  );
  expect(view().getByText("Revision that initially fails")).toBeTruthy();
  await user.click(view().getByRole("button", { name: "Retry answer" }));
  await waitFor(() =>
    expect(view().getByText("Answer to revised question.")).toBeTruthy(),
  );
  expect(attempt).toBe(2);
});

test("keeps a cancelled revised question available to retry", async () => {
  const user = userEvent.setup();
  renderAssistant({
    async sendMessages({ abortSignal }) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start", messageId: "partial-answer" });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "Partial revised answer.",
          });
          abortSignal?.addEventListener("abort", () => controller.close());
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  });
  await submitRevision(user, "Revision cancelled during generation");
  await waitFor(() =>
    expect(view().getByText("Partial revised answer.")).toBeTruthy(),
  );
  await user.click(view().getByRole("button", { name: "Close assistant" }));
  await waitFor(() =>
    expect(view().getByRole("button", { name: "Retry answer" })).toBeTruthy(),
  );
  expect(view().getByText("Revision cancelled during generation")).toBeTruthy();
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
          controller.enqueue({ type: "start", messageId: "revised-answer" });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "Answer to revised question.",
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

function originalThread(): ResearchThread {
  return {
    ...thread(),
    messages: [
      {
        ...message(questionId, "user", "What does the evidence establish?"),
        ...(attachmentBacked
          ? {
              temporaryEvidence: [
                { filename: "evidence.txt", mediaType: "text/plain" as const },
              ],
            }
          : {}),
      },
      {
        ...message(answerId, "assistant", "Original answer."),
        parentMessageId: questionId,
        model: "z-ai/glm-5.3-flash",
      },
    ],
  };
}

function revisedThread(content: string): ResearchThread {
  return {
    ...thread(),
    updatedAt: "2026-09-05T12:02:00.000Z",
    messages: [
      {
        ...message(revisedQuestionId, "user", content),
        originMessageId: questionId,
        ...(attachmentBacked
          ? {
              temporaryEvidence: [
                { filename: "evidence.txt", mediaType: "text/plain" as const },
              ],
            }
          : {}),
        questionAlternatives: {
          position: 2,
          total: 2,
          previousQuestionId: questionId,
        },
      },
    ],
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

async function submitRevision(
  user: ReturnType<typeof userEvent.setup>,
  content: string,
) {
  await user.click(view().getByRole("button", { name: "Edit question" }));
  const editor = view().getByRole("textbox", { name: "Revised question" });
  await user.clear(editor);
  await user.type(editor, content);
  await user.click(
    view().getByRole("button", { name: "Regenerate from here" }),
  );
}

function answerStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "revised-answer" });
      controller.enqueue({ type: "text-start", id: "answer" });
      controller.enqueue({
        type: "text-delta",
        id: "answer",
        delta: "Answer to revised question.",
      });
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
): ResearchThread["messages"][number] {
  return { id, role, content, createdAt: "2026-09-05T12:00:00.000Z" };
}

function thread() {
  return {
    id: threadId,
    sourceId: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Revision inquiry",
    createdAt: "2026-09-05T12:00:00.000Z",
    updatedAt: "2026-09-05T12:01:00.000Z",
  };
}

function view() {
  return within(document.body);
}
