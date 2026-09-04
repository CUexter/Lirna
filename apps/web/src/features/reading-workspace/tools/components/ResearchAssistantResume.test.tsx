import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import type { ChatTransport } from "ai";
import { createRef } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

const questionId = "40000000-0000-4000-8000-000000000000";
const answerId = "50000000-0000-4000-8000-000000000000";

await mock.module("../hooks/useResearchThreads", () => ({
  useResearchThreads: () => ({
    activeThread: {
      id: "30000000-0000-4000-8000-000000000000",
      sourceId: "10000000-0000-4000-8000-000000000000",
      stateId: "20000000-0000-4000-8000-000000000000",
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Existing inquiry",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:01:00.000Z",
      messages: [
        {
          id: questionId,
          role: "user",
          content: "What is the central claim?",
          selectedText: "Synthetic evidence",
          createdAt: "2026-09-01T12:00:00.000Z",
        },
        {
          id: answerId,
          role: "assistant",
          content: "The existing answer remains exact.",
          references: [
            {
              componentIdentity: "active:/",
              componentLabel: "Main entry",
              selection: {
                offsetBasis: "normalized-derivative-text-v1",
                normalizedStartOffset: 0,
                normalizedEndOffset: 18,
                exactText: "Synthetic evidence",
                prefix: "",
                suffix: " supports the claim.",
              },
            },
          ],
          createdAt: "2026-09-01T12:01:00.000Z",
        },
      ],
    },
    activeThreadId: "30000000-0000-4000-8000-000000000000",
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

test("renders a resumed selected path with its context and References unchanged", async () => {
  const transport: ChatTransport<ResearchAssistantMessage> = {
    async sendMessages() {
      throw new Error("No question should be sent while resuming");
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
        plainText: "Synthetic evidence supports the claim.",
        sourceId: "10000000-0000-4000-8000-000000000000",
        sourceTitle: "Test source",
        stateId: "20000000-0000-4000-8000-000000000000",
      }}
      transport={transport}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  );

  await waitFor(() =>
    expect(
      within(document.body).getByText("What is the central claim?"),
    ).toBeTruthy(),
  );
  expect(
    within(document.body).getByText("The existing answer remains exact."),
  ).toBeTruthy();
  expect(within(document.body).getByText("Synthetic evidence")).toBeTruthy();
  expect(
    within(document.body).getByRole("button", { name: "Used 1 source" }),
  ).toBeTruthy();
});
