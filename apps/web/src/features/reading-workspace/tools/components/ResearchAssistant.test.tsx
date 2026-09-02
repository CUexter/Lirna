import { afterEach, expect, test } from "bun:test";
import { createChat } from "@shadcn/helpers/ai-sdk";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport } from "ai";
import { createRef } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";
import { ReadingResearchAssistant } from "./ResearchAssistant";
import { ResearchAssistantTranscript } from "./ResearchAssistantTranscript";
import { ResearchThreadPicker } from "./ResearchThreadPicker";

afterEach(() => {
  cleanup();
});

test("animates while waiting and renders streamed Markdown with AI Elements", async () => {
  const user = userEvent.setup();
  const chat = createChat<ResearchAssistantMessage>()
    .user("What is grounded?")
    .assistant("A **grounded** answer.");
  const scriptedTransport = chat.transport({ delayMs: 0 });
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const transport: ChatTransport<ResearchAssistantMessage> = {
    async sendMessages(options) {
      await responseGate;
      return scriptedTransport.sendMessages(options);
    },
    reconnectToStream(options) {
      return scriptedTransport.reconnectToStream(options);
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
        componentIdentity: "article",
        componentLabel: "Article",
        plainText: "Possible worlds are grounded in extensional semantics.",
        sourceId: "source-id",
        sourceTitle: "Possible Worlds",
        stateId: "state-id",
      }}
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  expect(document.querySelector("[data-slot='card']")).toBeNull();
  expect(document.querySelector("[data-slot='empty']")).toBeTruthy();
  expect(view().getByText("Ask this Source")).toBeTruthy();

  await user.type(view().getByLabelText("Question"), "What is grounded?");
  await user.click(view().getByRole("button", { name: "Send question" }));

  const waiting = await waitFor(() => view().getByRole("status"));
  expect(waiting.textContent).toContain("Reading this Source state");
  expect(waiting.querySelector("[data-slot='spinner']")).toBeTruthy();
  expect(waiting.querySelector(".bg-clip-text.text-transparent")).toBeTruthy();
  expect(document.querySelectorAll("[data-slot='message']")).toHaveLength(1);
  expect(document.querySelectorAll("[data-slot='bubble']")).toHaveLength(1);
  expect(
    view()
      .getByText("What is grounded?")
      .closest("[data-slot='message-scroller-item']")
      ?.getAttribute("data-scroll-anchor"),
  ).toBe("false");

  await act(async () => {
    releaseResponse();
    await responseGate;
  });
  await waitFor(() => expect(view().queryByRole("status")).toBeNull());
  const emphasis = await waitFor(() => view().getByText("grounded"));
  expect(emphasis.closest(".size-full")).toBeTruthy();
  expect(document.querySelectorAll("[data-slot='message']")).toHaveLength(1);
});

test("shows, removes, and sends temporary evidence attachments", async () => {
  const user = userEvent.setup();
  const chat = createChat<ResearchAssistantMessage>()
    .user("What does this add?")
    .assistant("The attachment adds temporary evidence.");
  const scriptedTransport = chat.transport({ delayMs: 0 });
  let sentMessage: ResearchAssistantMessage | undefined;
  const transport: ChatTransport<ResearchAssistantMessage> = {
    sendMessages(options) {
      sentMessage = options.messages.at(-1);
      return scriptedTransport.sendMessages(options);
    },
    reconnectToStream(options) {
      return scriptedTransport.reconnectToStream(options);
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
        componentIdentity: "article",
        componentLabel: "Article",
        plainText: "Possible worlds are grounded in extensional semantics.",
        sourceId: "source-id",
        sourceTitle: "Possible Worlds",
        stateId: "state-id",
      }}
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );
  const attachment = new File(["temporary evidence"], "evidence.txt", {
    type: "text/plain",
  });
  const input = view().getByLabelText("Attach files");

  await act(async () => {
    await user.upload(input, attachment);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() => expect(view().getByText("evidence.txt")).toBeTruthy());
  await user.click(view().getByRole("button", { name: "Remove evidence.txt" }));
  expect(view().queryByText("evidence.txt")).toBeNull();

  await act(async () => {
    await user.upload(input, attachment);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await user.type(view().getByLabelText("Question"), "What does this add?");
  await user.click(view().getByRole("button", { name: "Send question" }));

  await waitFor(() => expect(sentMessage).toBeDefined());
  expect(sentMessage?.metadata?.attachments).toEqual([
    {
      dataUrl: "data:text/plain;base64,dGVtcG9yYXJ5IGV2aWRlbmNl",
      filename: "evidence.txt",
      mediaType: "text/plain",
      size: 18,
    },
  ]);
  expect(view().getByText("evidence.txt")).toBeTruthy();
  await waitFor(() => expect(view().queryByRole("status")).toBeNull());
});

test("collapses selected evidence into an article navigation action", async () => {
  const user = userEvent.setup();
  const chat = createChat<ResearchAssistantMessage>()
    .user("Why does this matter?")
    .assistant("It frames the argument.");
  const selection = {
    offsetBasis: "normalized-derivative-text-v1" as const,
    normalizedStartOffset: 0,
    normalizedEndOffset: 15,
    exactText: "Possible worlds",
    prefix: "",
    suffix: " are grounded in extensional sem",
  };
  let shownSelection: typeof selection | undefined;
  render(
    <ReadingResearchAssistant
      onClose={() => {}}
      open
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(value) => ({
        show: () => {
          shownSelection = value;
        },
        text: value.exactText,
      })}
      reading={{
        componentIdentity: "article",
        componentLabel: "Article",
        plainText: "Possible worlds are grounded in extensional semantics.",
        sourceId: "source-id",
        sourceTitle: "Possible Worlds",
        stateId: "state-id",
      }}
      selection={selection}
      transport={chat.transport({ delayMs: 0 })}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  expect(view().getByText(selection.exactText)).toBeTruthy();
  expect(view().getByText("Quoted passage")).toBeTruthy();
  await user.click(view().getByRole("button", { name: "Show in article" }));
  expect(shownSelection).toEqual(selection);

  await user.type(view().getByLabelText("Question"), "Why does this matter?");
  await user.click(view().getByRole("button", { name: "Send question" }));
  await waitFor(() => expect(view().queryByRole("status")).toBeNull());
  expect(
    view().getAllByRole("button", { name: "Show in article" }),
  ).toHaveLength(1);
  expect(view().getAllByText("Quoted passage")).toHaveLength(1);
  expect(view().getAllByText(selection.exactText)).toHaveLength(1);
});

test("selects an existing Research thread and starts a new one", async () => {
  const user = userEvent.setup();
  let resumed: string | undefined;
  let startedNew = false;
  render(
    <ResearchThreadPicker
      activeThreadId="30000000-0000-4000-8000-000000000000"
      disabled={false}
      onNew={() => {
        startedNew = true;
      }}
      onResume={(threadId) => {
        resumed = threadId;
      }}
      threads={[
        {
          id: "30000000-0000-4000-8000-000000000000",
          sourceId: "10000000-0000-4000-8000-000000000000",
          stateId: "20000000-0000-4000-8000-000000000000",
          componentIdentity: "article",
          componentLabel: "Article",
          title: "Existing inquiry",
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
        },
        {
          id: "40000000-0000-4000-8000-000000000000",
          sourceId: "10000000-0000-4000-8000-000000000000",
          stateId: "20000000-0000-4000-8000-000000000000",
          componentIdentity: "article",
          componentLabel: "Article",
          title: "Earlier inquiry",
          createdAt: "2026-09-01T11:00:00.000Z",
          updatedAt: "2026-09-01T11:00:00.000Z",
        },
      ]}
    />,
  );

  await user.click(view().getByRole("button", { name: "Research thread" }));
  await user.type(
    view().getByPlaceholderText("Search Research threads…"),
    "Earlier",
  );
  await user.click(view().getByRole("option", { name: /Earlier inquiry/ }));
  expect(resumed).toBe("40000000-0000-4000-8000-000000000000");
  await user.click(
    view().getByRole("button", { name: "Start new Research thread" }),
  );
  expect(startedNew).toBe(true);
});

test("renders a tool-verified passage as a navigable Source", async () => {
  const user = userEvent.setup();
  let shown = false;
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            { type: "text", text: "The supplement supports the claim." },
            {
              type: "tool-referencePassage",
              toolCallId: "reference-call",
              state: "output-available",
              input: {
                componentIdentity: "supplement-one",
                exactText: "Supplement evidence.",
                occurrence: 1,
              },
              output: {
                kind: "source-passage-reference",
                componentIdentity: "supplement-one",
                componentLabel: "Supplement one",
                selection: {
                  offsetBasis: "normalized-derivative-text-v1",
                  normalizedStartOffset: 0,
                  normalizedEndOffset: 20,
                  exactText: "Supplement evidence.",
                  prefix: "",
                  suffix: "",
                },
              },
            },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {
          shown = true;
        },
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  await user.click(view().getByRole("button", { name: "Used 1 source" }));
  expect(view().getByText("Supplement evidence.")).toBeTruthy();
  await user.click(
    view().getByRole("link", { name: "Show Supplement one in article" }),
  );
  expect(shown).toBe(true);
});

test("separates chronological research activity, answer, and Sources", async () => {
  const user = userEvent.setup();
  let shown = false;
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "text",
              text: "Let me read the problems-concretism supplement.",
            },
            {
              type: "tool-readSourceComponent",
              toolCallId: "read-call",
              state: "output-available",
              input: { componentIdentity: "supplement-one", offset: 0 },
              output: {
                found: true,
                componentIdentity: "supplement-one",
                componentLabel: "Supplement one",
                offset: 0,
                endOffset: 20,
                text: "Supplement evidence.",
              },
            },
            { type: "step-start" },
            {
              type: "text",
              text: "Let me verify the passage before answering.",
            },
            {
              type: "tool-referencePassage",
              toolCallId: "reference-call",
              state: "output-available",
              input: {
                componentIdentity: "supplement-one",
                exactText: "Supplement evidence.",
                occurrence: 1,
              },
              output: {
                kind: "source-passage-reference",
                componentIdentity: "supplement-one",
                componentLabel: "Supplement one",
                selection: {
                  offsetBasis: "normalized-derivative-text-v1",
                  normalizedStartOffset: 0,
                  normalizedEndOffset: 20,
                  exactText: "Supplement evidence.",
                  prefix: "",
                  suffix: "",
                },
              },
            },
            { type: "step-start" },
            { type: "text", text: "## Grounded connection" },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {
          shown = true;
        },
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  const firstTask = view().getByText(
    "Let me read the problems-concretism supplement.",
  );
  const readTool = view().getByText("Read Source component");
  const secondTask = view().getByText(
    "Let me verify the passage before answering.",
  );
  const referenceTool = view().getByText("Reference passage");
  const answer = view().getByRole("heading", { name: "Grounded connection" });
  expect(
    firstTask.compareDocumentPosition(readTool) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    readTool.compareDocumentPosition(secondTask) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    secondTask.compareDocumentPosition(referenceTool) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    referenceTool.compareDocumentPosition(answer) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  await user.click(view().getByRole("button", { name: "Used 1 source" }));
  await user.click(
    view().getByRole("link", { name: "Show Supplement one in article" }),
  );
  expect(shown).toBe(true);
});

test("shows an in-progress tool before the model emits text", () => {
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "tool-readSourceComponent",
              toolCallId: "read-call",
              state: "input-available",
              input: { componentIdentity: "supplement-one", offset: 0 },
            },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending
    />,
  );

  expect(view().getByText("Read Source component")).toBeTruthy();
  expect(view().getByText("Running")).toBeTruthy();
});

test("explains when a saved Research response did not complete", () => {
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "user-message",
          role: "user",
          parts: [{ type: "text", text: "What happened?" }],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  expect(
    view().getByText(
      "This response did not complete. Ask the question again to retry.",
    ),
  ).toBeTruthy();
});

function view() {
  return within(document.body);
}
