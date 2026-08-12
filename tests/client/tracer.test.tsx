// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/app";
import { createAppRouter } from "@/router";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ["/"] }),
  );
  render(<App queryClient={queryClient} router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tracer application shell", () => {
  it("renders the shell at the index route", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Trace the whole system." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Synthetic fixture")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run operation" }),
    ).toBeInTheDocument();
  });

  it("submits through TanStack Query and surfaces the completed artifact", async () => {
    const completed = {
      id: "op-9",
      status: "completed",
      result: {
        artifactUrl: "/api/operations/op-9/artifact",
        vaultPath: "synthetic/op-9.md",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "op-9", status: "queued" }),
      })
      .mockResolvedValue({ ok: true, json: async () => completed });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Run operation" }),
    );

    const link = await screen.findByRole("link", {
      name: "Open the stored synthetic artifact",
    });
    expect(link).toHaveAttribute("href", "/api/operations/op-9/artifact");
    await waitFor(() =>
      expect(screen.getByText("completed")).toBeInTheDocument(),
    );
  });

  it("surfaces a submission failure without a completed link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    renderApp();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Run operation" }),
    );

    expect(
      await screen.findByText("The operation could not be submitted"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Open the stored synthetic artifact",
      }),
    ).not.toBeInTheDocument();
  });
});
