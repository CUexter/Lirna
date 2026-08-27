import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { candidateFixture } from "@/components/reading-workspace/derivative-test-fixtures";
import {
  createTestQueryClient,
  queryClientWrapper,
} from "@/test-support/query-hook";

const candidate = candidateFixture(true);
const activationPreview = {
  baselineSequence: 4,
  consequences: candidate.comparison,
};
const calls: Record<string, unknown[]> = {
  activate: [],
  generate: [],
  preview: [],
};
const actions: Record<string, (input: unknown) => Promise<unknown>> = {};

function mutation(name: string) {
  return {
    mutationOptions: (options: object = {}) => ({
      mutationFn: (input: unknown) => actions[name](input),
      ...options,
    }),
  };
}

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      readingWorkspace: {
        key: ({ input }: { input: unknown }) => ["reading-workspace", input],
      },
      derivatives: {
        activate: mutation("activate"),
        generate: mutation("generate"),
        previewActivation: mutation("preview"),
      },
    },
  },
}));

const { useDerivativeUpdate } = await import("./use-derivative-update");

function recorded(name: string, result: unknown) {
  return async (input: unknown) => {
    calls[name].push(input);
    return result;
  };
}

function resetActions() {
  actions.generate = recorded("generate", candidate);
  actions.preview = recorded("preview", activationPreview);
  actions.activate = recorded("activate", { id: "activation-id" });
}

resetActions();

afterEach(() => {
  cleanup();
  for (const values of Object.values(calls)) values.length = 0;
  resetActions();
});

test("generates a state-bound candidate and activates it explicitly", async () => {
  const client = createTestQueryClient();
  const workspaceKey = [
    "reading-workspace",
    { sourceId: "source-id", stateId: "state-id" },
  ];
  client.setQueryData(workspaceKey, { retained: true });
  const { result, rerender } = renderHook(
    ({ sourceId, stateId }) => useDerivativeUpdate(sourceId, stateId),
    {
      initialProps: { sourceId: "source-id", stateId: "state-id" },
      wrapper: queryClientWrapper(client),
    },
  );

  act(() => result.current.generate());
  await waitFor(() => expect(result.current.candidate).toEqual(candidate));
  expect(calls.generate).toEqual([
    { sourceId: "source-id", stateId: "state-id" },
  ]);

  rerender({ sourceId: "source-id", stateId: "other-state" });
  expect(result.current.candidate).toBeUndefined();
  rerender({ sourceId: "source-id", stateId: "state-id" });
  expect(result.current.candidate).toEqual(candidate);

  await expect(
    result.current.previewActivation("derivative-id"),
  ).resolves.toEqual(activationPreview);
  expect(calls.preview).toEqual([
    {
      derivativeId: "derivative-id",
      sourceId: "source-id",
      stateId: "state-id",
    },
  ]);

  act(() =>
    result.current.activate(
      "derivative-id",
      "Reviewed activation",
      activationPreview,
    ),
  );
  await waitFor(() => expect(result.current.candidate).toBeUndefined());
  expect(calls.activate).toEqual([
    {
      derivativeId: "derivative-id",
      expectedBaselineSequence: 4,
      expectedConsequences: activationPreview.consequences,
      reason: "Reviewed activation",
      sourceId: "source-id",
      stateId: "state-id",
    },
  ]);
  expect(client.getQueryState(workspaceKey)?.isInvalidated).toBe(true);
});

test("exposes generation, preview, and activation failures", async () => {
  actions.generate = async () => {
    throw new Error("Generate failed");
  };
  actions.preview = async () => {
    throw new Error("Preview failed");
  };
  actions.activate = async () => {
    throw new Error("Activate failed");
  };
  const client = createTestQueryClient();
  const { result } = renderHook(
    () => useDerivativeUpdate("source-id", "state-id"),
    { wrapper: queryClientWrapper(client) },
  );

  act(() => result.current.generate());
  await waitFor(() =>
    expect(result.current.generateError?.message).toBe("Generate failed"),
  );

  await expect(
    result.current.previewActivation("derivative-id"),
  ).rejects.toThrow("Preview failed");
  await waitFor(() =>
    expect(result.current.activateError?.message).toBe("Preview failed"),
  );

  act(() =>
    result.current.activate(
      "derivative-id",
      "Reviewed activation",
      activationPreview,
    ),
  );
  await waitFor(() =>
    expect(result.current.activateError?.message).toBe("Activate failed"),
  );
});
