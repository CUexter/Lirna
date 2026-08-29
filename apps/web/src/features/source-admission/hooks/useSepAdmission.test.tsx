import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  admittedFixture,
  previewFixture,
} from "@/features/source-admission/test-support/fixtures";
import {
  createTestQueryClient,
  queryClientWrapper,
} from "@/test-support/queryHook";

const preview = previewFixture({ title: "Initial preview" });
const refreshedPreview = previewFixture({ title: "Refreshed preview" });
const admitted = admittedFixture();
const calls: Record<string, unknown[]> = {
  admit: [],
  delete: [],
  extend: [],
  get: [],
  retry: [],
  submit: [],
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
      delete: mutation("delete"),
      extend: mutation("extend"),
      get: { call: (input: unknown) => actions.get(input) },
      retry: mutation("retry"),
      submit: mutation("submit"),
    },
  },
}));

const { useSepAdmission } = await import("./useSepAdmission");
type Admission = ReturnType<typeof useSepAdmission>;
let admission: Admission;

function Harness({ replacesSourceId }: { replacesSourceId?: string }) {
  admission = useSepAdmission(replacesSourceId);
  return (
    <form aria-label="admission" onSubmit={admission.onSubmit}>
      <input
        aria-label="SEP URL"
        onChange={(event) => admission.onUrlChange(event.target.value)}
        value={admission.url}
      />
      <button type="submit">Create preview</button>
    </form>
  );
}

function recorded(name: string, result: unknown) {
  return async (input: unknown) => {
    calls[name].push(input);
    return result;
  };
}

function renderAdmission(replacesSourceId?: string) {
  const client = createTestQueryClient();
  return render(<Harness replacesSourceId={replacesSourceId} />, {
    wrapper: queryClientWrapper(client),
  });
}

afterEach(() => {
  cleanup();
  for (const values of Object.values(calls)) values.length = 0;
  actions.submit = recorded("submit", preview);
  actions.extend = recorded("extend", preview);
  actions.delete = recorded("delete", undefined);
  actions.retry = recorded("retry", refreshedPreview);
  actions.admit = recorded("admit", admitted);
  actions.get = recorded("get", refreshedPreview);
});

actions.submit = recorded("submit", preview);
actions.extend = recorded("extend", preview);
actions.delete = recorded("delete", undefined);
actions.retry = recorded("retry", refreshedPreview);
actions.admit = recorded("admit", admitted);
actions.get = recorded("get", refreshedPreview);

test("validates and submits an HTTPS SEP URL", async () => {
  const user = userEvent.setup();
  renderAdmission("replaced-source");

  await user.click(view().getByRole("button", { name: "Create preview" }));
  expect(admission.validationError).toContain("complete URL");

  await user.type(view().getByLabelText("SEP URL"), "http://example.com");
  await user.click(view().getByRole("button", { name: "Create preview" }));
  expect(admission.validationError).toContain("HTTPS");

  await user.clear(view().getByLabelText("SEP URL"));
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  expect(admission.validationError).toBeUndefined();
  await user.click(view().getByRole("button", { name: "Create preview" }));

  await waitFor(() => expect(admission.preview).toEqual(preview));
  expect(calls.submit).toEqual([
    {
      replacesSourceId: "replaced-source",
      url: "https://plato.stanford.edu/entries/test/",
    },
  ]);
});

test("runs and resets the preview lifecycle through its public controls", async () => {
  const user = userEvent.setup();
  renderAdmission();
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() => expect(admission.preview).toEqual(preview));

  act(() => admission.admission.onAdmit(["submitted"]));
  await waitFor(() =>
    expect(calls.admit).toEqual([
      { observationKeys: ["submitted"], previewId: preview.id },
    ]),
  );
  await waitFor(() => expect(admission.admission.result).toEqual(admitted));

  act(() => admission.lifecycle.onExtend());
  await waitFor(() =>
    expect(calls.extend).toEqual([{ previewId: preview.id }]),
  );
  act(() => admission.lifecycle.onRetry());
  await waitFor(() => expect(admission.preview).toEqual(refreshedPreview));
  expect(calls.retry).toEqual([{ previewId: preview.id }]);

  act(() => admission.lifecycle.onDelete());
  await waitFor(() => expect(admission.preview).toBeUndefined());
  expect(calls.delete).toEqual([{ previewId: preview.id }]);
  expect(admission.url).toBe("");
});

test("reports mutation failures and refreshes after a failed retry", async () => {
  actions.submit = async () => {
    throw new Error("Submit failed");
  };
  const user = userEvent.setup();
  renderAdmission();
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() =>
    expect(admission.submitErrorMessage?.message).toBe("Submit failed"),
  );

  actions.submit = recorded("submit", preview);
  await user.type(view().getByLabelText("SEP URL"), "x");
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() => expect(admission.preview).toEqual(preview));

  actions.retry = async () => {
    throw new Error("Retry failed");
  };
  act(() => admission.lifecycle.onRetry());
  await waitFor(() => expect(admission.preview).toEqual(refreshedPreview));
  expect(admission.lifecycle.error?.message).toBe("Retry failed");
  expect(calls.get).toEqual([{ previewId: preview.id }]);

  actions.get = async () => {
    throw new Error("Refresh failed");
  };
  act(() => admission.lifecycle.onRetry());
  await waitFor(() => expect(calls.get).toHaveLength(1));
  expect(admission.lifecycle.error?.message).toBe("Retry failed");

  for (const [name, invoke] of [
    ["Extend", () => admission.lifecycle.onExtend()],
    ["Delete", () => admission.lifecycle.onDelete()],
    ["Admit", () => admission.admission.onAdmit(["submitted"])],
  ] as const) {
    actions[name.toLowerCase()] = async () => {
      throw new Error(`${name} failed`);
    };
    act(invoke);
    await waitFor(() =>
      expect(
        name === "Admit"
          ? admission.admission.error?.message
          : admission.lifecycle.error?.message,
      ).toBe(`${name} failed`),
    );
  }
});

test("ignores lifecycle controls until a preview exists", () => {
  renderAdmission();
  act(() => {
    admission.admission.onAdmit(["submitted"]);
    admission.lifecycle.onDelete();
    admission.lifecycle.onExtend();
    admission.lifecycle.onRetry();
  });
  expect(Object.values(calls).flat()).toEqual([]);
});

function view() {
  return within(document.body);
}
