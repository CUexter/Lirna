import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { candidateFixture } from "./derivative-test-fixtures";
import { readingWorkspaceFixture } from "./source-information-test-fixture";

const calls = { activate: [] as unknown[], generate: [] as unknown[] };
let generatedCandidate: ReturnType<typeof candidateFixture> | undefined;

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      derivatives: {
        generate: {
          mutationOptions: (options: object = {}) => ({
            mutationFn: async (input: unknown) => {
              calls.generate.push(input);
              return generatedCandidate;
            },
            ...options,
          }),
        },
        previewActivation: {
          mutationOptions: (options: object = {}) => ({
            mutationFn: async () => ({
              baselineSequence: 1,
              consequences: candidateFixture(true).comparison,
            }),
            ...options,
          }),
        },
        activate: {
          mutationOptions: (options: object = {}) => ({
            mutationFn: async (input: unknown) => {
              calls.activate.push(input);
              return { id: "activation" };
            },
            ...options,
          }),
        },
      },
    },
  },
}));

await mock.module("@/clients/library", () => ({
  library: {
    sources: {
      readingWorkspace: {
        key: ({ input }: { input: unknown }) => ["reading-workspace", input],
      },
    },
  },
}));

const { DerivativeReview } = await import("./derivative-review");

afterEach(() => {
  cleanup();
  calls.activate.length = 0;
  calls.generate.length = 0;
  generatedCandidate = undefined;
});

test("reviews validation, comparison, unresolved evidence, and explicit activation", async () => {
  generatedCandidate = candidateFixture(true);
  const user = userEvent.setup();
  renderReview();

  await user.click(view().getByRole("button", { name: "Generate candidate" }));
  await waitFor(() => view().getByText("Candidate version 2"));
  expect(view().getByText(/Semantic and diagnostic comparison/)).toBeTruthy();
  expect(view().getByText(/annotation annotation-1: unresolved/)).toBeTruthy();
  expect(
    view().getByText(
      /reading-position position-1: exact\. Target: article at 12-18/,
    ),
  ).toBeTruthy();
  expect(
    view().getByText(/remain attached to their original immutable evidence/),
  ).toBeTruthy();

  window.confirm = () => false;
  await user.click(view().getByRole("button", { name: "Activate candidate" }));
  expect(calls.activate).toHaveLength(0);
  window.confirm = () => true;
  await user.click(view().getByRole("button", { name: "Activate candidate" }));
  await waitFor(() => expect(calls.activate).toHaveLength(1));
  expect(calls.activate[0]).toMatchObject({
    derivativeId: "60000000-0000-4000-8000-000000000000",
    expectedBaselineSequence: 1,
    expectedConsequences: candidateFixture(true).comparison,
    reason:
      "Explicit activation after candidate validation and consequence review",
  });
});

test("shows invalid candidates as blocked and prevents activation", async () => {
  generatedCandidate = candidateFixture(false);
  const user = userEvent.setup();
  renderReview();

  await user.click(view().getByRole("button", { name: "Generate candidate" }));
  const blocked = await waitFor(() =>
    view().getByRole("button", {
      name: "Resolve validation failures to activate",
    }),
  );
  expect(blocked.hasAttribute("disabled")).toBe(true);
  expect(view().getByText("Activation blocked")).toBeTruthy();
});

test("confirms rollback by appending activation of a prior valid derivative", async () => {
  const workspace = readingWorkspaceFixture();
  const state = workspace.state;
  if (!state) throw new Error("Missing state fixture");
  const persisted = candidateFixture(true);
  state.derivatives.push({
    ...state.derivatives[0],
    id: "70000000-0000-4000-8000-000000000000",
    validation: persisted.validation,
    comparison: persisted.comparison,
    currentActivation: undefined,
    activationHistory: [],
  });
  let confirmation = "";
  window.confirm = (message) => {
    confirmation = String(message);
    return true;
  };
  const user = userEvent.setup();
  renderReview(state);

  expect(view().getByText("Authored records requiring review")).toBeTruthy();

  await user.click(
    view().getByRole("button", { name: "Roll back to this version" }),
  );
  await waitFor(() => expect(calls.activate).toHaveLength(1));
  expect(calls.activate[0]).toMatchObject({
    derivativeId: "70000000-0000-4000-8000-000000000000",
    reason: "Explicit rollback to a prior valid Reading Derivative",
  });
  expect(confirmation).toContain("Structural changes: 0");
  expect(confirmation).toContain("Authored-record relocations: unresolved: 1");
});

function renderReview(state = readingWorkspaceFixture().state) {
  if (!state) throw new Error("Missing state fixture");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DerivativeReview sourceId={state.sourceId} state={state} />
    </QueryClientProvider>,
  );
}

function view() {
  return within(document.body);
}
