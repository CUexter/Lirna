import { afterEach, expect, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "@/test-support/renderRoute";
import { admittedFixture, previewFixture } from "../test-support/fixtures";
import { SepAdmissionPreview } from "./Preview";

afterEach(cleanup);

test("renders retained Admission evidence", () => {
  renderPreview();

  expect(view().getByText("Synthetic SEP entry")).toBeTruthy();
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

test("owns selection and disables every action while the preview changes", async () => {
  const user = userEvent.setup();
  const admitted: unknown[][] = [];
  const extended: unknown[] = [];
  const removed: unknown[] = [];
  const retried: unknown[] = [];
  const preview = previewFixture();
  const rendered = renderPreview({
    onAdmit: (keys) => admitted.push(keys),
    onDelete: () => removed.push(true),
    onExtend: () => extended.push(true),
    onRetry: () => retried.push(true),
  });

  await user.click(
    view().getByRole("checkbox", { name: /Recommended archive/ }),
  );
  await user.click(
    view().getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    }),
  );
  await user.click(
    view().getByRole("button", { name: "Admit active and archive" }),
  );
  expect(admitted).toEqual([["submitted", "recommended-archive"]]);

  rendered.rerender(
    <SepAdmissionPreview
      admission={{ pending: false, onAdmit: (keys) => admitted.push(keys) }}
      lifecycle={{
        extendPending: false,
        deletePending: false,
        retryPending: true,
        onDelete: () => removed.push(true),
        onExtend: () => extended.push(true),
        onRetry: () => retried.push(true),
      }}
      preview={preview}
    />,
  );
  expect(
    view().getByRole("button", { name: "Retrying with larger limits…" }),
  ).toHaveProperty("disabled", true);
  expect(
    view().getByRole("button", { name: "Extend seven days" }),
  ).toHaveProperty("disabled", true);
  expect(
    view().getByRole("button", { name: "Admit active and archive" }),
  ).toHaveProperty("disabled", true);

  rendered.rerender(
    <SepAdmissionPreview
      admission={{ pending: false, onAdmit: (keys) => admitted.push(keys) }}
      lifecycle={{
        extendPending: false,
        deletePending: false,
        retryPending: false,
        onDelete: () => removed.push(true),
        onExtend: () => extended.push(true),
        onRetry: () => retried.push(true),
      }}
      preview={previewFixture({
        capture: {
          ...preview.capture,
          budget: "expanded",
          retryUsed: true,
          retryAvailable: false,
        },
      })}
    />,
  );
  expect(
    view()
      .getByRole("checkbox", { name: /Recommended archive/ })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    view().getByRole("button", { name: "Admit active observation" }),
  ).toHaveProperty("disabled", true);

  await user.click(view().getByRole("button", { name: "Extend seven days" }));
  await user.click(view().getByRole("button", { name: "Delete preview" }));
  expect(extended).toHaveLength(1);
  expect(removed).toHaveLength(1);
  expect(retried).toHaveLength(0);
});

test("renders decision errors and admits a recommended archive by itself", async () => {
  const user = userEvent.setup();
  const admitted: unknown[][] = [];
  render(
    <SepAdmissionPreview
      admission={{
        pending: false,
        error: { message: "Admission failed" },
        onAdmit: (keys) => admitted.push(keys),
      }}
      lifecycle={{
        extendPending: false,
        deletePending: false,
        retryPending: false,
        error: { message: "Preview lifecycle failed" },
        onDelete: () => undefined,
        onExtend: () => undefined,
        onRetry: () => undefined,
      }}
      preview={previewFixture()}
    />,
  );

  expect(view().getByText("Admission failed")).toBeTruthy();
  expect(view().getByText("Preview lifecycle failed")).toBeTruthy();
  await user.click(view().getByRole("checkbox", { name: /^Active / }));
  expect(view().getByText("Select at least one observation.")).toBeTruthy();
  await user.click(
    view().getByRole("checkbox", { name: /Recommended archive/ }),
  );
  await user.click(
    view().getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    }),
  );
  await user.click(
    view().getByRole("button", { name: "Admit recommended archive" }),
  );
  expect(admitted).toEqual([["recommended-archive"]]);
});

test("renders a completed Admission with links to its immutable states", async () => {
  const result = admittedFixture();
  const rootRoute = createRootRoute();
  const previewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <SepAdmissionPreview
        admission={{
          pending: false,
          result,
          onAdmit: () => undefined,
        }}
        lifecycle={{
          extendPending: false,
          deletePending: false,
          retryPending: false,
          onDelete: () => undefined,
          onExtend: () => undefined,
          onRetry: () => undefined,
        }}
        preview={previewFixture()}
      />
    ),
  });
  const readingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/$sourceId/$stateId",
    component: () => null,
  });

  await renderRoute(rootRoute.addChildren([previewRoute, readingRoute]), "/");

  expect(view().getByText("Source admitted")).toBeTruthy();
  expect(view().getByText("Immutable states created")).toBeTruthy();
  expect(
    view().getByRole("link", { name: /State 2: Active \(created\)/ }),
  ).toBeTruthy();
});

test("reports an admitted state whose initial Reading Derivative is invalid", async () => {
  const result = admittedFixture();
  const state = result.states[0];
  if (!state) throw new Error("Admitted state fixture missing");
  state.derivatives.push({
    id: "40000000-0000-4000-8000-000000000000",
    kind: "sep-reading-v1",
    valid: false,
    generation: {
      version: 1,
      parser: { id: "parse5", version: "7.3.0" },
      renderer: { id: "lirna-reading-react", version: "1" },
      inputResourceHashes: [],
    },
    validation: {
      status: "invalid",
      checks: [
        {
          subject: "typed-structure",
          status: "failed",
          messages: ["Unsupported character encoding."],
        },
      ],
    },
    generationError: "Unsupported character encoding.",
    createdAt: "2026-08-18T12:01:00.000Z",
    activationHistory: [],
  });
  const rootRoute = createRootRoute();
  const previewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <SepAdmissionPreview
        admission={{
          pending: false,
          result,
          onAdmit: () => undefined,
        }}
        lifecycle={{
          extendPending: false,
          deletePending: false,
          retryPending: false,
          onDelete: () => undefined,
          onExtend: () => undefined,
          onRetry: () => undefined,
        }}
        preview={previewFixture()}
      />
    ),
  });

  await renderRoute(rootRoute.addChildren([previewRoute]), "/");

  expect(view().getByRole("alert").textContent).toContain(
    "Source state was admitted, but its Reading Derivative needs regeneration",
  );
  expect(view().getByRole("alert").textContent).toContain(
    "Unsupported character encoding.",
  );
});

function renderPreview({
  onAdmit = () => undefined,
  onDelete = () => undefined,
  onExtend = () => undefined,
  onRetry = () => undefined,
}: {
  onAdmit?: (keys: Array<"submitted" | "recommended-archive">) => void;
  onDelete?: () => void;
  onExtend?: () => void;
  onRetry?: () => void;
} = {}) {
  return render(
    <SepAdmissionPreview
      admission={{ pending: false, onAdmit }}
      lifecycle={{
        extendPending: false,
        deletePending: false,
        retryPending: false,
        onDelete,
        onExtend,
        onRetry,
      }}
      preview={previewFixture()}
    />,
  );
}

function view() {
  return within(document.body);
}
