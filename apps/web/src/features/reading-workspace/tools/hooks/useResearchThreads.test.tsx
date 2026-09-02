import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const threadId = "30000000-0000-4000-8000-000000000000";
let loadCalls = 0;

await mock.module("../researchAssistantTransport", () => ({
  listResearchThreads: async () => [],
  loadResearchThread: async () => {
    loadCalls += 1;
    return {
      id: threadId,
      sourceId: "source-id",
      stateId: "state-id",
      componentIdentity: "article",
      componentLabel: "Article",
      title: "Grounded inquiry",
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:00.000Z",
      messages: [
        {
          id: "assistant-message",
          role: "assistant",
          content: "Saved answer without streamed tool parts.",
          createdAt: "2026-09-02T12:00:00.000Z",
        },
      ],
    };
  },
}));

const { useResearchThreads } = await import("./useResearchThreads");

afterEach(() => {
  cleanup();
  loadCalls = 0;
});

test("does not replace a live response when its Research thread finishes", async () => {
  const { result } = renderHook(() =>
    useResearchThreads({
      disabled: false,
      open: true,
      preferNew: false,
      scope: { sourceId: "source-id", stateId: "state-id" },
    }),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.threadCreated(threadId);
  });

  expect(loadCalls).toBe(0);
  expect(result.current.activeThread).toBeUndefined();
  expect(result.current.activeThreadId).toBe(threadId);
});
