import { afterEach, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const threadId = "30000000-0000-4000-8000-000000000000";
let loadCalls = 0;
let deferThreadList = false;
let resolveThreadList: (() => void) | undefined;
let resolveSelection:
  | ((thread: ReturnType<typeof researchThread>) => void)
  | undefined;
let relatedInput: unknown;
let relatedError: Error | undefined;

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
  loadResearchThreadLineage: async () => ({ relatedThreads: [] }),
  reviseResearchQuestion: async () => researchThread(),
  selectResearchAnswer: () =>
    new Promise<ReturnType<typeof researchThread>>((resolve) => {
      resolveSelection = resolve;
    }),
  selectResearchQuestion: async () => researchThread(),
  createRelatedResearchThread: async (input: unknown) => {
    relatedInput = input;
    if (relatedError) throw relatedError;
    return researchThread("related-thread");
  },
}));

const { useResearchThreads } = await import("./useResearchThreads");

afterEach(() => {
  cleanup();
  loadCalls = 0;
  deferThreadList = false;
  resolveThreadList = undefined;
  resolveSelection = undefined;
  relatedInput = undefined;
  relatedError = undefined;
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

test("opens a newly created related Research thread in the current Source-state scope", async () => {
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
    await result.current.createRelated({
      creationId: "creation-id",
      sourceThreadId: threadId,
      sourceAnswerMessageId: "assistant-message",
      title: "Related inquiry",
    });
  });

  expect(relatedInput).toEqual({
    creationId: "creation-id",
    sourceId: "source-id",
    stateId: "state-id",
    sourceThreadId: threadId,
    sourceAnswerMessageId: "assistant-message",
    title: "Related inquiry",
  });
  expect(result.current.activeThreadId).toBe("related-thread");
  expect(result.current.activeThread?.id).toBe("related-thread");
});

test("distinguishes rejected creation from an indeterminate failure", async () => {
  const { result } = renderHook(() =>
    useResearchThreads({
      disabled: false,
      open: true,
      preferNew: false,
      scope: { sourceId: "source-id", stateId: "state-id" },
    }),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const input = {
    creationId: "creation-id",
    sourceThreadId: threadId,
    sourceAnswerMessageId: "assistant-message",
    title: "Related inquiry",
  };

  relatedError = new ORPCError("CONFLICT");
  let rejected:
    | Awaited<ReturnType<typeof result.current.createRelated>>
    | undefined;
  await act(async () => {
    rejected = await result.current.createRelated(input);
  });
  expect(rejected).toEqual({ status: "rejected" });

  relatedError = new Error("Network response was lost");
  let indeterminate:
    | Awaited<ReturnType<typeof result.current.createRelated>>
    | undefined;
  await act(async () => {
    indeterminate = await result.current.createRelated(input);
  });
  expect(indeterminate).toEqual({ status: "indeterminate" });
});

function researchThread(id = threadId) {
  return {
    id,
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
