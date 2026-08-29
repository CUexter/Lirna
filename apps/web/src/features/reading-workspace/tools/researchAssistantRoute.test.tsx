import { afterEach, expect, mock, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "@/test-support/renderRoute";
import { sourceId, stateId } from "../test-support/fixtures";
import {
  derivativeClientStub,
  readingWorkspaceFixture,
  sepUpdateClientStub,
} from "../test-support/sourceInformation";

let assistantInput: unknown;

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

afterEach(() => {
  assistantInput = undefined;
  cleanup();
});

test("opens a Source-grounded assistant beside the reading workspace", async () => {
  const user = userEvent.setup();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  const askTab = view().getByRole("button", { name: "Ask this Source" });
  expect(askTab.getAttribute("aria-expanded")).toBe("false");
  expect(
    view().queryByRole("complementary", { name: "Research assistant" }),
  ).toBeNull();

  await user.click(askTab);

  expect(askTab.getAttribute("aria-expanded")).toBe("true");
  const assistant = view().getByRole("complementary", {
    name: "Research assistant",
  });
  expect(
    within(assistant).getByRole("textbox", { name: "Question" }),
  ).toBeTruthy();
  expect(
    within(assistant).getByRole<HTMLButtonElement>("button", {
      name: "Send question",
    }).disabled,
  ).toBe(true);
  expect(within(assistant).getByText(/Synthetic Reading Source/)).toBeTruthy();

  await user.click(view().getByRole("button", { name: "Close assistant" }));
  expect(
    view().queryByRole("complementary", { name: "Research assistant" }),
  ).toBeNull();
  expect(askTab.getAttribute("aria-expanded")).toBe("false");
});

test("sends a question through the server and shows the answer", async () => {
  const user = userEvent.setup();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  await user.click(view().getByRole("button", { name: "Ask this Source" }));

  await user.type(
    view().getByRole("textbox", { name: "Question" }),
    "What claim does this Source make?",
  );
  await user.click(view().getByRole("button", { name: "Send question" }));

  await waitFor(() =>
    view().getByText("The Source presents a synthetic claim."),
  );
  expect(assistantInput).toEqual({
    sourceId,
    stateId,
    componentIdentity: "article",
    question: "What claim does this Source make?",
  });
});
