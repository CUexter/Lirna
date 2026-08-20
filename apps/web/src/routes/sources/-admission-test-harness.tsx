import { mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, within } from "@testing-library/react";
import { mutationOptions } from "@/test-support/mutation-options";

import { admittedFixture, previewFixture } from "./-admission-test-fixtures";

export const calls = {
  admit: [] as unknown[],
  delete: [] as unknown[],
  extend: [] as unknown[],
  get: [] as unknown[],
  retry: [] as unknown[],
  submit: [] as unknown[],
};

export const actions: Record<
  "admit" | "extend" | "get" | "remove" | "retry" | "submit",
  (input: unknown) => Promise<unknown>
> = Object.create(null);

function recordedAction(log: unknown[], result: unknown) {
  return async (input: unknown) => {
    log.push(input);
    return result;
  };
}

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: {
      submit: {
        mutationOptions: () => mutationOptions(() => actions.submit),
      },
      extend: {
        mutationOptions: () => mutationOptions(() => actions.extend),
      },
      delete: {
        mutationOptions: () => mutationOptions(() => actions.remove),
      },
      retry: { mutationOptions: () => mutationOptions(() => actions.retry) },
      admit: { mutationOptions: () => mutationOptions(() => actions.admit) },
      get: { call: (input: unknown) => actions.get(input) },
    },
  },
}));

const { Route } = await import("./admission");

export function view() {
  return within(document.body);
}

export async function renderAdmission() {
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

export function resetActions() {
  for (const values of Object.values(calls)) values.length = 0;
  actions.submit = recordedAction(calls.submit, previewFixture());
  actions.extend = recordedAction(calls.extend, previewFixture());
  actions.remove = recordedAction(calls.delete, undefined);
  actions.retry = recordedAction(calls.retry, previewFixture());
  actions.admit = recordedAction(calls.admit, admittedFixture());
  actions.get = recordedAction(calls.get, previewFixture());
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
