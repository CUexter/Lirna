import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const threadId = "30000000-0000-4000-8000-000000000000";
let loadCalls = 0;
let deferThreadList = false;
let resolveThreadList: (() => void) | undefined;
let resolveSelection:
  | ((thread: ReturnType<typeof researchThread>) => void)
  | undefined;

await mock.module("../researchAssistantTransport", () => ({
  listResearchThreads: async () => {
    if (deferThreadList)
      await new Promise<void>((resolve) => {
        resolveThreadList = resolve;
      });
    return [];
  },
  loadResearchThread: async () => {
    loadCalls += 1;
    return researchThread();
  },
  selectResearchAnswer: () =>
    new Promise<ReturnType<typeof researchThread>>((resolve) => {
      resolveSelection = resolve;
    }),
}));

const { useResearchThreads } = await import("./useResearchThreads");

afterEach(() => {
  cleanup();
  loadCalls = 0;
  deferThreadList = false;
  resolveThreadList = undefined;
  resolveSelection = undefined;
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

test("does not restore a late answer selection after starting a new thread", async () => {
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

  let selection: ReturnType<typeof result.current.selectAnswer> | undefined;
  await act(async () => {
    selection = result.current.selectAnswer(
      "alternative-answer",
      "assistant-message",
    );
    await Promise.resolve();
  });
  act(() => result.current.startNew());
  await act(async () => {
    resolveSelection?.(researchThread());
    await selection;
  });

  expect(result.current.activeThread).toBeUndefined();
  expect(result.current.activeThreadId).toBeUndefined();
  expect(result.current.loading).toBe(false);
});

test("does not restore a late created thread after starting another thread", async () => {
  const { result } = renderHook(() =>
    useResearchThreads({
      disabled: false,
      open: true,
      preferNew: false,
      scope: { sourceId: "source-id", stateId: "state-id" },
    }),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  deferThreadList = true;

  let refresh: ReturnType<typeof result.current.threadCreated> | undefined;
  await act(async () => {
    refresh = result.current.threadCreated(threadId);
    await Promise.resolve();
  });
  act(() => result.current.startNew());
  await act(async () => {
    resolveThreadList?.();
    await refresh;
  });

  expect(result.current.activeThread).toBeUndefined();
  expect(result.current.activeThreadId).toBeUndefined();
});

function researchThread() {
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
        role: "assistant" as const,
        content: "Saved answer without streamed tool parts.",
        createdAt: "2026-09-02T12:00:00.000Z",
      },
    ],
  };
}
