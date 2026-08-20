import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  admittedFixture,
  previewFixture,
  previewId,
} from "./-admission-test-fixtures";

const calls = {
  admit: [] as unknown[],
  delete: [] as unknown[],
  extend: [] as unknown[],
  get: [] as unknown[],
  retry: [] as unknown[],
  submit: [] as unknown[],
};

let submit: (input: unknown) => Promise<unknown> = async () => previewFixture();
let extend: (input: unknown) => Promise<unknown> = async () => undefined;
let remove: (input: unknown) => Promise<unknown> = async () => undefined;
let retry: (input: unknown) => Promise<unknown> = async () =>
  previewFixture({
    capture: {
      ...previewFixture().capture,
      retryUsed: true,
      retryAvailable: false,
    },
  });
let admit: (input: unknown) => Promise<unknown> = async () => admittedFixture();
let get: (input: unknown) => Promise<unknown> = async () => previewFixture();

function mutationOptions<TInput>(
  getAction: () => (input: TInput) => Promise<unknown>,
) {
  return { mutationFn: (input: TInput) => getAction()(input) };
}

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: {
      submit: { mutationOptions: () => mutationOptions(() => submit) },
      extend: { mutationOptions: () => mutationOptions(() => extend) },
      delete: { mutationOptions: () => mutationOptions(() => remove) },
      retry: { mutationOptions: () => mutationOptions(() => retry) },
      admit: { mutationOptions: () => mutationOptions(() => admit) },
      get: { call: (input: unknown) => get(input) },
    },
  },
}));

const { Route } = await import("./admission");

function view() {
  return within(document.body);
}

async function renderAdmission() {
  const rootRoute = createRootRoute();
  const admissionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/admission",
    component: Route.options.component,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/sources/admission"] }),
    routeTree: rootRoute.addChildren([admissionRoute]),
  });
  await router.load();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function resetActions() {
  for (const values of Object.values(calls)) values.length = 0;
  submit = async (input) => {
    calls.submit.push(input);
    return previewFixture();
  };
  extend = async (input) => {
    calls.extend.push(input);
    return previewFixture();
  };
  remove = async (input) => {
    calls.delete.push(input);
  };
  retry = async (input) => {
    calls.retry.push(input);
    return previewFixture();
  };
  admit = async (input) => {
    calls.admit.push(input);
    return admittedFixture();
  };
  get = async (input) => {
    calls.get.push(input);
    return previewFixture();
  };
}

async function submitPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() => view().getByText("Synthetic SEP entry"));
}

test("validates, resets, submits, and renders a synthetic preview", async () => {
  resetActions();
  const user = userEvent.setup();
  await renderAdmission();

  await user.click(view().getByRole("button", { name: "Create preview" }));
  expect(view().getByRole("alert").textContent).toContain("complete URL");
  await user.clear(view().getByLabelText("SEP URL"));
  await user.type(
    view().getByLabelText("SEP URL"),
    "http://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  expect(view().getByRole("alert").textContent).toContain("HTTPS");
  await user.clear(view().getByLabelText("SEP URL"));
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  expect(view().queryByRole("alert")).toBeNull();
  await user.click(view().getByRole("button", { name: "Create preview" }));

  await waitFor(() => view().getByText("Synthetic SEP entry"));
  expect(calls.submit).toEqual([
    { url: "https://plato.stanford.edu/entries/test/" },
  ]);
  expect(view().getByText("Ada Lovelace")).toBeTruthy();
  expect(view().getByText("Completeness: Partial")).toBeTruthy();
  expect(view().getByText("ordinary-cloud")).toBeTruthy();
  expect(view().getByText("Requests").parentElement?.textContent).toContain(
    "2",
  );
  expect(
    view().getByText("One optional resource was not retained."),
  ).toBeTruthy();
  expect(view().getAllByText("Recommended archive")).toHaveLength(2);
});

test("runs lifecycle controls and disables controls while retrying", async () => {
  resetActions();
  const user = userEvent.setup();
  let resolveRetry: (value: unknown) => void = () => undefined;
  retry = (input) => {
    calls.retry.push(input);
    return new Promise((resolve) => {
      resolveRetry = resolve;
    });
  };
  await renderAdmission();
  await submitPreview(user);

  await user.click(
    view().getByRole("button", { name: "Use larger capture limits" }),
  );
  await waitFor(() =>
    view().getByRole("button", { name: "Retrying with larger limits…" }),
  );
  expect(
    view().getByRole("button", { name: "Extend seven days" }),
  ).toHaveProperty("disabled", true);
  resolveRetry(
    previewFixture({
      capture: {
        ...previewFixture().capture,
        retryUsed: true,
        retryAvailable: false,
      },
    }),
  );
  await waitFor(() =>
    view().getByRole("button", { name: "Extend seven days" }),
  );
  expect(calls.retry).toEqual([{ previewId }]);

  await user.click(view().getByRole("button", { name: "Extend seven days" }));
  expect(calls.extend).toEqual([{ previewId }]);
  await user.click(
    view().getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    }),
  );
  await user.click(
    view().getByRole("button", { name: "Admit active observation" }),
  );
  await waitFor(() => view().getByText("Source admitted"));
  expect(calls.admit).toEqual([{ previewId, observationKeys: ["submitted"] }]);
  await user.click(view().getByRole("button", { name: "Delete preview" }));
  expect(calls.delete).toEqual([{ previewId }]);
});

test("shows submit and retry failures while retaining refreshed capture state", async () => {
  resetActions();
  const user = userEvent.setup();
  submit = async () => {
    throw new Error("Preview service unavailable");
  };
  await renderAdmission();
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Preview service unavailable",
    ),
  );

  submit = async (input) => {
    calls.submit.push(input);
    return previewFixture();
  };
  await user.type(view().getByLabelText("SEP URL"), "x");
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() => view().getByText("Synthetic SEP entry"));
  retry = async () => {
    throw new Error("Retry capture failed");
  };
  get = async (input) => {
    calls.get.push(input);
    return previewFixture({ title: "Refreshed synthetic SEP entry" });
  };
  await user.click(
    view().getByRole("button", { name: "Use larger capture limits" }),
  );
  await waitFor(() => view().getByText("Refreshed synthetic SEP entry"));
  expect(view().getByRole("alert").textContent).toContain(
    "Retry capture failed",
  );
  expect(calls.get).toEqual([{ previewId }]);

  get = async () => {
    throw new Error("Refresh failed");
  };
  await user.click(
    view().getByRole("button", { name: "Use larger capture limits" }),
  );
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Retry capture failed",
    ),
  );

  admit = async () => {
    throw new Error("Admission failed");
  };
  await user.click(
    view().getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    }),
  );
  await user.click(
    view().getByRole("button", { name: "Admit active observation" }),
  );
  await waitFor(() => view().getByText("Admission failed"));
});
