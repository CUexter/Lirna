import { afterEach, expect, test } from "bun:test";
import { createChat } from "@shadcn/helpers/ai-sdk";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatTransport } from "ai";
import { createRef } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";
import { ReadingResearchAssistant } from "./ResearchAssistant";

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
      reading={{
        componentIdentity: "article",
        componentLabel: "Article",
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
      reading={{
        componentIdentity: "article",
        componentLabel: "Article",
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

function view() {
  return within(document.body);
}
