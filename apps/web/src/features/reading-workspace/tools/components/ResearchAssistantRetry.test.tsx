import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport, UIMessageChunk } from "ai";
import { createRef } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";

await mock.module("../hooks/useResearchThreads", () => ({
  useResearchThreads: () => ({
    activeThread: {
      id: threadId,
      sourceId: "10000000-0000-4000-8000-000000000000",
      stateId: "20000000-0000-4000-8000-000000000000",
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Unanswered inquiry",
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:00:00.000Z",
      messages: [
        {
          id: questionId,
          role: "user",
          content: "What does the temporary evidence establish?",
          temporaryEvidence: [
            { filename: "evidence.txt", mediaType: "text/plain" },
          ],
          createdAt: "2026-09-04T12:00:00.000Z",
        },
      ],
    },
    activeThreadId: threadId,
    error: undefined,
    loading: false,
    resume: async () => {},
    startNew: () => {},
    threadCreated: async () => {},
    threads: [],
  }),
}));

const { ReadingResearchAssistant } = await import("./ResearchAssistant");

afterEach(cleanup);

test("retries an unanswered question after required evidence is reattached", async () => {
  const user = userEvent.setup();
  let sent:
    | Parameters<ChatTransport<ResearchAssistantMessage>["sendMessages"]>[0]
    | undefined;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport: ChatTransport<ResearchAssistantMessage> = {
    async sendMessages(options) {
      sent = options;
      return new ReadableStream<UIMessageChunk>({
        async start(controller) {
          await gate;
          controller.enqueue({ type: "start", messageId: "retry-answer" });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "The retried answer.",
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
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  expect(view().getByRole("button", { name: "Retry answer" })).toBeTruthy();
  expect(
    view().getByText("Temporary evidence: evidence.txt (text/plain)"),
  ).toBeTruthy();
  await user.click(view().getByRole("button", { name: "Retry answer" }));
  expect(sent).toBeUndefined();
  expect(view().getByRole("alert").textContent).toContain(
    "Reattach temporary evidence before retrying: evidence.txt (text/plain)",
  );

  const file = new File(["temporary evidence"], "evidence.txt", {
    type: "text/plain",
  });
  await act(async () => {
    await user.upload(view().getByLabelText("Attach files"), file);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await user.click(view().getByRole("button", { name: "Retry answer" }));
  await waitFor(() => expect(sent).toBeDefined());
  expect(sent).toMatchObject({
    trigger: "regenerate-message",
    messageId: questionId,
    body: {
      retryAttachments: [
        {
          dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
          filename: "evidence.txt",
          mediaType: "text/plain",
          size: 18,
        },
      ],
    },
  });
  expect(
    view().getByRole<HTMLButtonElement>("button", { name: "Retry answer" })
      .disabled,
  ).toBe(true);

  await act(async () => {
    release();
    await gate;
  });
  await waitFor(() =>
    expect(view().getByText("The retried answer.")).toBeTruthy(),
  );
  expect(view().queryByRole("button", { name: "Retry answer" })).toBeNull();
});

test("keeps a cancelled question available to retry", async () => {
  const user = userEvent.setup();
  const transport: ChatTransport<ResearchAssistantMessage> = {
    async sendMessages({ abortSignal }) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start", messageId: "partial-answer" });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "A partial answer.",
          });
          abortSignal?.addEventListener("abort", () => controller.close());
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
  const assistant = (open: boolean) => (
    <ReadingResearchAssistant
      onClose={() => {}}
      open={open}
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
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />
  );
  const rendered = render(assistant(true));
  const file = new File(["temporary evidence"], "evidence.txt", {
    type: "text/plain",
  });
  await act(async () => {
    await user.upload(view().getByLabelText("Attach files"), file);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await user.click(view().getByRole("button", { name: "Retry answer" }));
  await waitFor(() =>
    expect(view().getByText("A partial answer.")).toBeTruthy(),
  );
  await user.click(view().getByRole("button", { name: "Close assistant" }));
  rendered.rerender(assistant(false));
  rendered.rerender(assistant(true));

  await waitFor(() =>
    expect(view().getByRole("button", { name: "Retry answer" })).toBeTruthy(),
  );
});

function view() {
  return within(document.body);
}
