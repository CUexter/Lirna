// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";
import { createAppRouter } from "./router";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ["/"] }),
  );
  render(<App queryClient={queryClient} router={router} />);
}

function renderAppAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
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
        resultPath: "synthetic/op-9.md",
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

describe("Source encounter", () => {
  it("keeps the stable destinations available", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderApp();

    for (const destination of ["Research", "Read", "Learn", "Sources", "Notes"]) {
      expect(await screen.findByRole("link", { name: destination })).toBeInTheDocument();
    }
  });

  it("explicitly admits a text Source and reads normalized text with authoritative evidence one action away", async () => {
    const source = {
      id: "source-1",
      title: "A synthetic publication",
      admittedAt: "2026-08-13T00:00:00.000Z",
      state: {
        id: "state-1",
        normalizedText: "First line.\n\nSecond line.",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
        admittedAt: "2026-08-13T00:00:00.000Z",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => source })
      .mockResolvedValueOnce({ ok: true, json: async () => source })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authoritativeText: "First line.\r\n\r\n   Second   line.  " }) });
    vi.stubGlobal("fetch", fetchMock);
    renderAppAt("/sources");

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title"), source.title);
    await user.type(screen.getByLabelText("Publication text"), "First line.\r\n\r\n   Second   line.  ");
    await user.selectOptions(screen.getByLabelText("Rights basis"), source.state.rightsBasis);
    await user.selectOptions(screen.getByLabelText("Sensitivity level"), source.state.sensitivityLevel);
    await user.click(screen.getByRole("button", { name: "Admit Source" }));

    expect(await screen.findByRole("heading", { name: source.title })).toBeInTheDocument();
    expect(document.querySelector("[data-normalized-text]")).toHaveTextContent(/First line\.\s+Second line\./);
    expect(screen.queryByText(/Second   line/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View authoritative evidence" }));
    expect(document.querySelector("[data-authoritative-evidence]")?.textContent).toBe("First line.\r\n\r\n   Second   line.  ");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sources",
      expect.objectContaining({
        method: "POST",
        body: expect.not.stringContaining("actor"),
      }),
    );
  });
});
