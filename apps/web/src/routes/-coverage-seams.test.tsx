import { expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

import Loader from "../components/loader";
import { ThemeProvider } from "../components/theme-provider";

function Primitive({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

function ButtonPrimitive({
  children,
  nativeButton,
  ...props
}: HTMLAttributes<HTMLDivElement> & { nativeButton?: boolean }) {
  return (
    <div data-native-button={nativeButton} {...props}>
      {children}
    </div>
  );
}

let OwnedButton: typeof import("@lirna/ui/components/button").Button;

function DropdownItem({
  children,
  onClick,
}: {
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <OwnedButton data-theme={children} onClick={onClick}>
      {children}
    </OwnedButton>
  );
}

await mock.module("@lirna/ui/components/badge", () => ({ Badge: Primitive }));
await mock.module("@lirna/ui/components/button", () => ({
  Button: ButtonPrimitive,
  buttonVariants: ({ className }: { className?: string } = {}) => className,
}));
await mock.module("@lirna/ui/components/card", () => ({
  Card: Primitive,
  CardAction: Primitive,
  CardContent: Primitive,
  CardDescription: Primitive,
  CardFooter: Primitive,
  CardHeader: Primitive,
  CardTitle: Primitive,
}));
await mock.module("@lirna/ui/components/dropdown-menu", () => ({
  DropdownMenu: Primitive,
  DropdownMenuContent: Primitive,
  DropdownMenuItem: DropdownItem,
  DropdownMenuTrigger: Primitive,
}));
await mock.module("@lirna/ui/components/input-group", () => ({
  InputGroup: Primitive,
  InputGroupAddon: Primitive,
  InputGroupInput: Primitive,
}));
await mock.module("@lirna/ui/components/separator", () => ({
  Separator: Primitive,
}));
await mock.module("@/utils/server-url", () => ({
  serverUrl: "http://127.0.0.1:3000",
}));

test("configures first-party clients to send authenticated ORPC requests", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    requests.push([input, init]);
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    const { inquiry } = await import("../clients/inquiry");
    const { library } = await import("../clients/library");
    void inquiry.sepAdmission.get.call({ previewId: "preview-1" });
    void library.annotations.list.call({
      sourceId: "source-1",
      stateId: "state-1",
    });

    await waitFor(() => expect(requests).toHaveLength(2));
    for (const [url, init] of requests) {
      expect(String(url)).toStartWith("http://127.0.0.1:3000/orpc");
      expect(init?.credentials).toBe("include");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders the focused home route and applies theme choices", async () => {
  ({ Button: OwnedButton } = await import("@lirna/ui/components/button"));
  const { Route } = await import("./index");
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Route.options.component,
  });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([homeRoute]),
  });

  await router.load();
  localStorage.removeItem("theme");
  render(
    <ThemeProvider attribute="class" defaultTheme="system">
      <Loader />
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  const view = within(document.body);
  await waitFor(() =>
    expect(view.getByRole("heading", { name: "Welcome back." })).toBeTruthy(),
  );
  expect(view.getAllByLabelText("Ask, search, or add something")).toHaveLength(
    2,
  );
  for (const [label, theme] of [
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ] as const) {
    const control = document.querySelector(`[data-theme="${label}"]`);
    if (!control) throw new Error(`Missing ${label} theme control`);
    fireEvent.click(control);
    await waitFor(() => expect(localStorage.getItem("theme")).toBe(theme));
  }
});
