import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport, UIMessageChunk } from "ai";
import { createRef, useState } from "react";

import type {
  ResearchAssistantMessage,
  ResearchThread,
  ResearchThreadLineage,
} from "../researchAssistantTransport";

const threadId = "30000000-0000-4000-8000-000000000000";
const questionId = "40000000-0000-4000-8000-000000000000";
const firstAnswerId = "50000000-0000-4000-8000-000000000000";
const secondAnswerId = "60000000-0000-4000-8000-000000000000";
let attachmentBacked = false;
let answerHasModel = true;
let relatedFailure: "indeterminate" | "rejected" | undefined;
let relatedInputs: Array<{
  creationId: string;
  sourceAnswerMessageId: string;
  title: string;
}> = [];
let lineage: ResearchThreadLineage | undefined;
let lineageNavigation: Array<string> = [];

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
      lineage,
      resume: async (threadId: string) => {
        lineageNavigation.push(threadId);
      },
      resumeSourceAnswer: async (threadId: string, answerMessageId: string) => {
        lineageNavigation.push(`${threadId}:${answerMessageId}`);
      },
      selectAnswer: async (answerId: string) => {
        const selected = projectedThread(answerId, attachmentBacked);
        setActiveThread(selected);
        return selected;
      },
      createRelated: async (input: {
        creationId: string;
        sourceAnswerMessageId: string;
        title: string;
      }) => {
        relatedInputs.push(input);
        if (relatedFailure) {
          const status = relatedFailure;
          relatedFailure = undefined;
          return { status };
        }
        const related = relatedThread();
        setActiveThread(related);
        return { status: "created", thread: related };
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
  answerHasModel = true;
  relatedFailure = undefined;
  relatedInputs = [];
  lineage = undefined;
  lineageNavigation = [];
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

test("previews, names, and opens a related Research thread", async () => {
  attachmentBacked = true;
  const user = userEvent.setup();
  renderAssistant(transport(() => {}));

  const action = view().getByRole("button", {
    name: "Start related Research thread",
  });
  action.focus();
  await user.keyboard("{Enter}");
  const preview = view().getByRole("region", {
    name: "Related Research thread preview",
  });
  expect(within(preview).getByText("What is the central claim?")).toBeTruthy();
  expect(within(preview).getByText("First durable answer.")).toBeTruthy();
  expect(within(preview).getByText(/Selected context:/)).toBeTruthy();
  expect(
    within(preview).getByText(/Temporary evidence: evidence.txt/),
  ).toBeTruthy();
  expect(
    within(preview).getByText(/Reference from Main entry: Evidence/),
  ).toBeTruthy();

  const title = view().getByRole("textbox", {
    name: "New Research thread name",
  });
  expect(document.activeElement).toBe(title);
  await user.type(title, "A materially different inquiry");
  await user.click(
    view().getByRole("button", { name: "Create related Research thread" }),
  );

  await waitFor(() =>
    expect(view().getByText("Copied final answer.")).toBeTruthy(),
  );
  expect(relatedInputs[0]).toMatchObject({
    sourceAnswerMessageId: firstAnswerId,
    title: "A materially different inquiry",
  });
  expect(relatedInputs[0]?.creationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(document.activeElement).toBe(
    view().getByRole("textbox", { name: "Question" }),
  );
});

test("retries an indeterminate creation with the same ID and locked input", async () => {
  relatedFailure = "indeterminate";
  const user = userEvent.setup();
  renderAssistant(transport(() => {}));
  await user.click(
    view().getByRole("button", { name: "Start related Research thread" }),
  );
  await user.type(
    view().getByRole("textbox", { name: "New Research thread name" }),
    "Stable inquiry name",
  );
  await user.click(
    view().getByRole("button", { name: "Create related Research thread" }),
  );

  const lockedTitle = view().getByRole<HTMLInputElement>("textbox", {
    name: "New Research thread name",
  });
  expect(lockedTitle.disabled).toBe(true);
  expect(
    view().queryByRole("button", { name: "Begin new attempt" }),
  ).toBeNull();
  await user.click(view().getByRole("button", { name: "Retry creation" }));
  await waitFor(() => expect(relatedInputs).toHaveLength(2));
  expect(relatedInputs[1]).toEqual(relatedInputs[0]);
});

test("can abandon a rejected creation and begin with a new ID", async () => {
  relatedFailure = "rejected";
  const user = userEvent.setup();
  renderAssistant(transport(() => {}));
  await user.click(
    view().getByRole("button", { name: "Start related Research thread" }),
  );
  await user.type(
    view().getByRole("textbox", { name: "New Research thread name" }),
    "Rejected inquiry",
  );
  await user.click(
    view().getByRole("button", { name: "Create related Research thread" }),
  );
  await user.click(view().getByRole("button", { name: "Begin new attempt" }));
  expect(
    view().getByRole<HTMLInputElement>("textbox", {
      name: "New Research thread name",
    }).disabled,
  ).toBe(false);
  await user.click(
    view().getByRole("button", { name: "Create related Research thread" }),
  );
  await waitFor(() => expect(relatedInputs).toHaveLength(2));
  expect(relatedInputs[1]?.creationId).not.toBe(relatedInputs[0]?.creationId);
});

test("offers related creation for a completed answer without model metadata", () => {
  answerHasModel = false;
  renderAssistant(transport(() => {}));

  expect(
    view().getByRole("button", { name: "Start related Research thread" }),
  ).toBeTruthy();
  expect(
    view().queryByRole("button", { name: "Regenerate answer" }),
  ).toBeNull();
});

test("navigates direct incoming and outgoing Research-thread lineage", async () => {
  lineage = {
    source: {
      answerMessageId: firstAnswerId,
      answerPreview: "The original answer.",
      threadId: "70000000-0000-4000-8000-000000000000",
      title: "Original inquiry",
    },
    relatedThreads: [
      {
        answerMessageId: firstAnswerId,
        answerPreview: "The nested divergence answer.",
        threadId: "80000000-0000-4000-8000-000000000000",
        title: "Nested inquiry",
      },
    ],
  };
  const user = userEvent.setup();
  renderAssistant(transport(() => {}));

  const panel = view().getByRole("region", { name: "Research thread lineage" });
  expect(within(panel).getByText(/The nested divergence answer/)).toBeTruthy();
  await user.click(
    within(panel).getByRole("button", {
      name: "Open source Research thread: Original inquiry",
    }),
  );
  await user.click(
    within(panel).getByRole("button", {
      name: "Open related Research thread: Nested inquiry",
    }),
  );

  expect(lineageNavigation).toEqual([
    `70000000-0000-4000-8000-000000000000:${firstAnswerId}`,
    "80000000-0000-4000-8000-000000000000",
  ]);
});

test("does not offer related creation for an unpersisted assistant answer", async () => {
  const user = userEvent.setup();
  renderAssistant(transport(() => {}));
  await user.click(view().getByRole("button", { name: "Regenerate answer" }));
  await waitFor(() =>
    expect(view().getByText("A regenerated answer.")).toBeTruthy(),
  );

  expect(
    view().queryByRole("button", { name: "Start related Research thread" }),
  ).toBeNull();
});

test("disables related-thread creation while a local turn is running", async () => {
  const user = userEvent.setup();
  renderAssistant(pendingTransport());
  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "Continue the current inquiry",
  );
  await user.click(view().getByRole("button", { name: "Send question" }));

  await waitFor(() =>
    expect(
      view().getByRole<HTMLButtonElement>("button", {
        name: "Start related Research thread",
      }).disabled,
    ).toBe(true),
  );
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

function pendingTransport(): ChatTransport<ResearchAssistantMessage> {
  return {
    async sendMessages() {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start", messageId: "pending-answer" });
          controller.enqueue({ type: "text-start", id: "answer" });
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
              selectedText: "Synthetic reading text.",
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
        ...(answerHasModel ? { model: "z-ai/glm-5.3-flash" as const } : {}),
        answerAlternatives: {
          position: second ? 2 : 1,
          total: 2,
          ...(second
            ? { previousAnswerId: firstAnswerId }
            : { nextAnswerId: secondAnswerId }),
        },
        references: [reference()],
        createdAt: second
          ? "2026-09-04T12:02:00.000Z"
          : "2026-09-04T12:01:00.000Z",
      },
    ],
  };
}

function reference() {
  return {
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    selection: {
      offsetBasis: "normalized-derivative-text-v1" as const,
      normalizedStartOffset: 0,
      normalizedEndOffset: 8,
      exactText: "Evidence",
      prefix: "",
      suffix: "",
    },
  };
}

function relatedThread(): ResearchThread {
  return {
    ...projectedThread(firstAnswerId, false),
    id: "70000000-0000-4000-8000-000000000000",
    title: "A materially different inquiry",
    messages: [
      {
        id: "80000000-0000-4000-8000-000000000000",
        role: "user",
        content: "What is the central claim?",
        createdAt: "2026-09-04T12:03:00.000Z",
      },
      {
        id: "90000000-0000-4000-8000-000000000000",
        parentMessageId: "80000000-0000-4000-8000-000000000000",
        role: "assistant",
        content: "Copied final answer.",
        model: "z-ai/glm-5.3-flash",
        createdAt: "2026-09-04T12:04:00.000Z",
      },
    ],
  };
}

function view() {
  return within(document.body);
}
