import { expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";

import Loader from "./components/loader";
import { ThemeProvider } from "./components/theme-provider";

function Primitive({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
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
await mock.module("@lirna/ui/components/button", () => ({ Button: Primitive }));
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

test("loads the focused web seams used by browser-owned surfaces", async () => {
  const inquiryClient = await import("./clients/inquiry");
  const libraryClient = await import("./clients/library");
  ({ Button: OwnedButton } = await import("@lirna/ui/components/button"));
  const { ModeToggle } = await import("./components/mode-toggle");
  const { routeTree } = await import("./routeTree.gen");

  expect(inquiryClient.inquiry).toBeDefined();
  expect(libraryClient.library).toBeDefined();

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree,
  });

  await router.load();
  render(
    <ThemeProvider attribute="class" defaultTheme="system">
      <Loader />
      <ModeToggle />
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(document.querySelector("svg")).toBeTruthy());
  for (const label of ["Light", "Dark", "System"]) {
    const control = document.querySelector(`[data-theme="${label}"]`);
    if (!control) throw new Error(`Missing ${label} theme control`);
    fireEvent.click(control);
  }
});
