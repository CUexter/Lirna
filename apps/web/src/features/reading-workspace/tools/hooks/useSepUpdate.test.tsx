import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  admittedFixture,
  previewFixture,
} from "@/features/source-admission/test-support/fixtures";
import {
  createTestQueryClient,
  queryClientWrapper,
} from "@/test-support/queryHook";

const initialPreview = previewFixture({ title: "Initial preview" });
const updatedPreview = previewFixture({ title: "Updated preview" });
const admitted = admittedFixture();
const calls: Record<string, unknown[]> = {
  admit: [],
  check: [],
  delete: [],
  extend: [],
  retry: [],
};
const actions: Record<string, (input: unknown) => Promise<unknown>> = {};

function mutation(name: string) {
  return {
    mutationOptions: () => ({
      mutationFn: (input: unknown) => actions[name](input),
    }),
  };
}

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: {
      admit: mutation("admit"),
      checkUpdate: mutation("check"),
      delete: mutation("delete"),
      extend: mutation("extend"),
      retry: mutation("retry"),
    },
  },
}));

const { useSepUpdate } = await import("./useSepUpdate");

function recorded(name: string, result: unknown) {
  return async (input: unknown) => {
    calls[name].push(input);
    return result;
  };
}

function renderUpdate() {
  const client = createTestQueryClient();
  return renderHook(() => useSepUpdate("source-id"), {
    wrapper: queryClientWrapper(client),
  });
}

function resetActions() {
  actions.check = recorded("check", initialPreview);
  actions.extend = recorded("extend", updatedPreview);
  actions.delete = recorded("delete", undefined);
  actions.retry = recorded("retry", updatedPreview);
  actions.admit = recorded("admit", admitted);
}

resetActions();

afterEach(() => {
  cleanup();
  for (const values of Object.values(calls)) values.length = 0;
  resetActions();
});

test("checks for an update and runs the preview lifecycle", async () => {
  const { result } = renderUpdate();

  act(() => result.current.check());
  await waitFor(() => expect(result.current.preview).toEqual(initialPreview));
  expect(calls.check).toEqual([{ sourceId: "source-id" }]);

  act(() => result.current.admission.onAdmit(["submitted"]));
  await waitFor(() =>
    expect(calls.admit).toEqual([
      { observationKeys: ["submitted"], previewId: initialPreview.id },
    ]),
  );
  await waitFor(() =>
    expect(result.current.admission.result).toEqual(admitted),
  );

  act(() => result.current.lifecycle.onExtend());
  await waitFor(() => expect(result.current.preview).toEqual(updatedPreview));
  expect(calls.extend).toEqual([{ previewId: initialPreview.id }]);

  act(() => result.current.lifecycle.onRetry());
  await waitFor(() =>
    expect(calls.retry).toEqual([{ previewId: initialPreview.id }]),
  );

  act(() => result.current.lifecycle.onDelete());
  await waitFor(() => expect(result.current.preview).toBeUndefined());
  expect(calls.delete).toEqual([{ previewId: initialPreview.id }]);
});

test("ignores preview controls before an update is available", () => {
  const { result } = renderUpdate();
  act(() => {
    result.current.admission.onAdmit(["submitted"]);
    result.current.lifecycle.onDelete();
    result.current.lifecycle.onExtend();
    result.current.lifecycle.onRetry();
  });
  expect(Object.values(calls).flat()).toEqual([]);
});

test("reports update and lifecycle failures", async () => {
  actions.check = async () => {
    throw new Error("Check failed");
  };
  const { result } = renderUpdate();
  act(() => result.current.check());
  await waitFor(() =>
    expect(result.current.checkError?.message).toBe("Check failed"),
  );

  actions.check = recorded("check", initialPreview);
  act(() => result.current.check());
  await waitFor(() => expect(result.current.preview).toEqual(initialPreview));

  actions.extend = async () => {
    throw new Error("Extend failed");
  };
  actions.delete = async () => {
    throw new Error("Delete failed");
  };
  actions.retry = async () => {
    throw new Error("Retry failed");
  };
  actions.admit = async () => {
    throw new Error("Admit failed");
  };
  act(() => {
    result.current.lifecycle.onExtend();
    result.current.lifecycle.onDelete();
    result.current.lifecycle.onRetry();
    result.current.admission.onAdmit(["submitted"]);
  });
  await waitFor(() =>
    expect(result.current.lifecycle.error?.message).toBe("Extend failed"),
  );
  await waitFor(() =>
    expect(result.current.admission.error?.message).toBe("Admit failed"),
  );
});
