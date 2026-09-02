import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { act, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "@/test-support/renderRoute";
import { sourceId, stateId } from "../test-support/fixtures";
import {
  derivativeClientStub,
  readingWorkspaceFixture,
  sepUpdateClientStub,
} from "../test-support/sourceInformation";

let assistantInput: unknown;
const threadId = "30000000-0000-4000-8000-000000000000";
let pauseAssistantStream = false;
let releaseAssistantStream: (() => void) | undefined;

async function* assistantStream(input: unknown) {
  assistantInput = input;
  yield { type: "start", messageId: "assistant-message" };
  yield { type: "start-step" };
  const usesSupplementEvidence = Boolean(
    input &&
      typeof input === "object" &&
      "question" in input &&
      input.question === "Use supplement evidence",
  );
  const usesTenthEvidence = Boolean(
    input &&
      typeof input === "object" &&
      "question" in input &&
      input.question === "Use tenth evidence",
  );
  const evidenceCount = usesTenthEvidence ? 10 : usesSupplementEvidence ? 1 : 0;
  if (evidenceCount) {
    const exactText = "First supplement content.";
    for (let index = 1; index <= evidenceCount; index += 1) {
      yield {
        type: "tool-input-available",
        toolCallId: `reference-call-${index}`,
        toolName: "referencePassage",
        input: {
          componentIdentity: "supplement-one",
          exactText,
          occurrence: 1,
        },
      };
      yield {
        type: "tool-output-available",
        toolCallId: `reference-call-${index}`,
        output: {
          kind: "source-passage-reference",
          id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          evidenceAlias: `ev_${index}`,
          componentIdentity: "supplement-one",
          componentLabel: "Supplement one",
          selection: {
            offsetBasis: "normalized-derivative-text-v1",
            normalizedStartOffset: 0,
            normalizedEndOffset: exactText.length,
            exactText,
            prefix: "",
            suffix: "\n\nSupplement citation context [1]".slice(0, 32),
          },
        },
      };
    }
    yield { type: "finish-step" };
    yield { type: "start-step" };
  }
  yield { type: "text-start", id: "assistant-text" };
  yield {
    type: "text-delta",
    id: "assistant-text",
    delta: "The **Source**",
  };
  if (pauseAssistantStream) {
    await new Promise<void>((resolve) => {
      releaseAssistantStream = resolve;
    });
  }
  yield {
    type: "text-delta",
    id: "assistant-text",
    delta: ` presents a synthetic claim.${usesSupplementEvidence ? "[^ev_1]" : usesTenthEvidence ? "[^ev_" : ""}`,
  };
  if (usesTenthEvidence)
    yield { type: "text-delta", id: "assistant-text", delta: "10]" };
  yield { type: "text-end", id: "assistant-text" };
  yield { type: "finish-step" };
  yield { type: "finish", finishReason: "stop" };
}

await mock.module("@/clients/inquiryClient", () => ({
  inquiryClient: {
    sources: {
      assistant: {
        ask: async (input: unknown) => assistantStream(input),
        create: async (input: {
          componentIdentity: string;
          question: string;
          sourceId: string;
          stateId: string;
        }) => ({
          id: threadId,
          ...input,
          componentLabel: "Article",
          title: input.question,
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
          messages: [],
        }),
        get: async () => undefined,
        list: async () => [],
      },
    },
  },
}));

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: sepUpdateClientStub,
    sources: {
      derivatives: derivativeClientStub,
      readingWorkspace: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading-workspace", input],
          queryFn: async () => readingWorkspaceFixture(),
        }),
      },
      resume: {
        get: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["resume", input],
            queryFn: async () => null,
          }),
        },
        save: {
          mutationOptions: () => ({ mutationFn: async () => undefined }),
        },
      },
      assistant: {
        ask: {
          mutationOptions: () => ({
            mutationFn: async (input: unknown) => {
              assistantInput = input;
              return { answer: "The Source presents a synthetic claim." };
            },
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
    citationResolutions: {
      evidence: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-evidence", input],
          queryFn: async () => [],
        }),
      },
      list: {
        key: ({ input }: { input: unknown }) => ["citation-resolutions", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-resolutions", input],
          queryFn: async () => [],
        }),
      },
      create: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      clear: {
        mutationOptions: () => ({ mutationFn: async () => false }),
      },
      infer: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
    },
    annotations: {
      list: {
        key: ({ input }: { input: unknown }) => ["annotations", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["annotations", input],
          queryFn: async () => [],
        }),
      },
      create: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      update: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
    },
  },
}));

const { Route } = await import("@/routes/sources/$sourceId/$stateId");

function view() {
  return within(document.body);
}

async function renderReading() {
  const rootRoute = createRootRoute();
  const readingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/$sourceId/$stateId",
    component: Route.options.component,
    validateSearch: Route.options.validateSearch,
  });
  return renderRoute(
    rootRoute.addChildren([readingRoute]),
    `/sources/${sourceId}/${stateId}`,
  );
}

async function selectPassage() {
  const passage = await waitFor(() =>
    view().getByText("A synthetic Source state passage."),
  );
  const range = document.createRange();
  range.setStart(passage.firstChild as Text, 2);
  range.setEnd(passage.firstChild as Text, 11);
  await act(async () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

afterEach(() => {
  releaseAssistantStream?.();
  assistantInput = undefined;
  pauseAssistantStream = false;
  releaseAssistantStream = undefined;
  cleanup();
});

test("opens a Source-grounded assistant beside the reading workspace", async () => {
  const user = userEvent.setup();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  const askTab = await waitFor(() =>
    view().getByRole("button", { name: "Ask this Source" }),
  );
  expect(askTab.getAttribute("aria-expanded")).toBe("false");
  expect(view().getByRole("main").classList.contains("grid-cols-1")).toBe(true);
  expect(
    view().queryByRole("complementary", { name: "Research assistant" }),
  ).toBeNull();

  await user.click(askTab);

  expect(askTab.getAttribute("aria-expanded")).toBe("true");
  const assistant = view().getByRole("complementary", {
    name: "Research assistant",
  });
  expect(assistant.classList.contains("fixed")).toBe(false);
  expect(askTab.classList.contains("fixed")).toBe(false);
  expect(view().getByRole("main").lastElementChild?.contains(assistant)).toBe(
    true,
  );
  expect(assistant.parentElement?.classList.contains("h-screen")).toBe(true);
  expect(
    view()
      .getByRole("main")
      .classList.contains(
        "grid-cols-[minmax(0,1fr)_clamp(24rem,calc(100vw-96rem),40vw)]",
      ),
  ).toBe(true);
  expect(
    view().getByRole("complementary", { name: "Reading tools" }),
  ).toBeTruthy();
  expect(
    within(assistant).getByRole("textbox", { name: "Question" }),
  ).toBeTruthy();
  expect(
    within(assistant).getByRole<HTMLButtonElement>("button", {
      name: "Send question",
    }).disabled,
  ).toBe(true);
  expect(within(assistant).getByText(/Synthetic Reading Source/)).toBeTruthy();
  expect(document.activeElement).toBe(
    within(assistant).getByRole("textbox", { name: "Question" }),
  );

  await user.click(view().getByRole("button", { name: "Close assistant" }));
  expect(
    view().queryByRole("complementary", { name: "Research assistant" }),
  ).toBeNull();
  expect(askTab.getAttribute("aria-expanded")).toBe("false");
  expect(
    view().getByRole("complementary", { name: "Reading tools" }),
  ).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(askTab));
});

test("streams a Markdown answer through the server", async () => {
  const user = userEvent.setup();
  pauseAssistantStream = true;
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  await user.click(
    await waitFor(() =>
      view().getByRole("button", { name: "Ask this Source" }),
    ),
  );

  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "What claim does this Source make?{Enter}",
  );

  const source = await waitFor(() => view().getByText("Source"));
  expect(source.closest(".size-full")).toBeTruthy();
  expect(
    view().queryByText((_, element) =>
      element?.tagName === "P"
        ? element.textContent === "The Source presents a synthetic claim."
        : false,
    ),
  ).toBeNull();

  releaseAssistantStream?.();
  await waitFor(() =>
    view().getByText((_, element) =>
      element?.tagName === "P"
        ? element.textContent === "The Source presents a synthetic claim."
        : false,
    ),
  );
  expect(assistantInput).toEqual({
    sourceId,
    stateId,
    componentIdentity: "article",
    question: "What claim does this Source make?",
    threadId,
  });
});

test("opens the assistant from selected text and sends its exact anchor", async () => {
  const user = userEvent.setup();
  await renderReading();
  await selectPassage();

  await user.click(view().getByRole("button", { name: "Ask about selection" }));

  const assistant = await waitFor(() =>
    view().getByRole("complementary", {
      name: "Research assistant",
    }),
  );
  expect(within(assistant).getByText("synthetic")).toBeTruthy();
  expect(document.activeElement).toBe(
    within(assistant).getByRole("textbox", { name: "Question" }),
  );
  await user.type(
    within(assistant).getByRole("textbox", { name: "Question" }),
    "What does this passage claim?",
  );
  await user.click(
    within(assistant).getByRole("button", { name: "Send question" }),
  );

  await waitFor(() =>
    within(assistant).getByText((_, element) =>
      element?.tagName === "P"
        ? element.textContent === "The Source presents a synthetic claim."
        : false,
    ),
  );
  expect(assistantInput).toEqual({
    sourceId,
    stateId,
    componentIdentity: "article",
    question: "What does this passage claim?",
    threadId,
    selection: {
      offsetBasis: "normalized-derivative-text-v1",
      normalizedStartOffset: 2,
      normalizedEndOffset: 11,
      exactText: "synthetic",
      prefix: "A ",
      suffix: expect.stringContaining(" Source state passage."),
    },
  });
});

test("keeps the assistant session when the reading component changes", async () => {
  const user = userEvent.setup();
  await renderReading();
  await selectPassage();
  await user.click(view().getByRole("button", { name: "Ask about selection" }));
  await waitFor(() =>
    view().getByRole("complementary", { name: "Research assistant" }),
  );
  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "Continue this inquiry",
  );

  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await user.click(view().getByRole("button", { name: "Supplement one" }));

  await waitFor(() =>
    expect(
      view().getByRole("complementary", { name: "Research assistant" }),
    ).toBeTruthy(),
  );
  const assistant = view().getByRole("complementary", {
    name: "Research assistant",
  });
  expect(within(assistant).getByText(/Supplement one/)).toBeTruthy();
  expect(within(assistant).queryByText("synthetic")).toBeNull();
  expect(
    within(assistant).getByRole<HTMLInputElement>("textbox", {
      name: "Question",
    }).value,
  ).toBe("Continue this inquiry");
  await user.click(
    within(assistant).getByRole("button", { name: "Send question" }),
  );
  await waitFor(() =>
    expect(assistantInput).toMatchObject({
      componentIdentity: "supplement-one",
      question: "Continue this inquiry",
      sourceId,
      stateId,
      threadId,
    }),
  );
});

test("focuses the composer when selected evidence replaces Source scope", async () => {
  const user = userEvent.setup();
  await renderReading();
  await user.click(
    await waitFor(() =>
      view().getByRole("button", { name: "Ask this Source" }),
    ),
  );
  await selectPassage();

  await user.click(view().getByRole("button", { name: "Ask about selection" }));

  const assistant = view().getByRole("complementary", {
    name: "Research assistant",
  });
  expect(within(assistant).getByText("synthetic")).toBeTruthy();
  expect(document.activeElement).toBe(
    within(assistant).getByRole("textbox", { name: "Question" }),
  );
});

test("opens a tool-referenced passage in a supplementary component", async () => {
  const user = userEvent.setup();
  await renderReading();
  await user.click(
    await waitFor(() =>
      view().getByRole("button", { name: "Ask this Source" }),
    ),
  );
  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "Use supplement evidence{Enter}",
  );

  await waitFor(() =>
    view().getByRole("button", {
      name: "Citation 1: Supporting evidence from Supplement one",
    }),
  );
  await user.hover(
    view().getByRole("button", {
      name: "Citation 1: Supporting evidence from Supplement one",
    }),
  );
  await waitFor(() => view().getByText("First supplement content."));
  await user.click(
    view().getByRole("button", {
      name: "Citation 1: Supporting evidence from Supplement one",
    }),
  );

  await waitFor(() =>
    expect(view().getAllByText("First supplement content.")).toHaveLength(2),
  );
  expect(
    view().getByRole("complementary", { name: "Research assistant" }),
  ).toBeTruthy();
});

test("renders a split multi-digit evidence alias as an inline citation", async () => {
  const user = userEvent.setup();
  await renderReading();
  await user.click(
    await waitFor(() =>
      view().getByRole("button", { name: "Ask this Source" }),
    ),
  );
  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "Use tenth evidence{Enter}",
  );

  await waitFor(() =>
    view().getByRole("button", {
      name: "Citation 10: Supporting evidence from Supplement one",
    }),
  );
  expect(view().queryByText("[^ev_10]")).toBeNull();
});
