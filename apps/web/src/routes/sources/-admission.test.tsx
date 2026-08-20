import { expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  admittedFixture,
  previewFixture,
  previewId,
} from "./-admission-test-fixtures";
import {
  actions,
  calls,
  deferred,
  renderAdmission,
  resetActions,
  view,
} from "./-admission-test-harness";

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

test("runs lifecycle controls and exposes each pending operation", async () => {
  resetActions();
  const user = userEvent.setup();

  const submitRequest = deferred<unknown>();
  actions.submit = (input) => {
    calls.submit.push(input);
    return submitRequest.promise;
  };
  await renderAdmission();
  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() =>
    view().getByRole("button", { name: "Creating preview…" }),
  );
  expect(view().getByLabelText("SEP URL")).toHaveProperty("disabled", true);
  submitRequest.resolve(previewFixture());
  await waitFor(() => view().getByText("Synthetic SEP entry"));
  await user.click(
    view().getByRole("checkbox", { name: /Recommended archive/ }),
  );
  await user.click(
    view().getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    }),
  );
  expect(
    view().getByRole("button", { name: "Admit active and archive" }),
  ).toHaveProperty("disabled", false);

  const retryRequest = deferred<unknown>();
  actions.retry = (input) => {
    calls.retry.push(input);
    return retryRequest.promise;
  };
  await user.click(
    view().getByRole("button", { name: "Use larger capture limits" }),
  );
  await waitFor(() =>
    view().getByRole("button", { name: "Retrying with larger limits…" }),
  );
  expect(
    view().getByRole("button", { name: "Extend seven days" }),
  ).toHaveProperty("disabled", true);
  expect(
    view().getByRole("button", { name: "Admit active and archive" }),
  ).toHaveProperty("disabled", true);
  retryRequest.resolve(
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

  const extendRequest = deferred<unknown>();
  actions.extend = (input) => {
    calls.extend.push(input);
    return extendRequest.promise;
  };
  await user.click(view().getByRole("button", { name: "Extend seven days" }));
  await waitFor(() => view().getByRole("button", { name: "Extending…" }));
  expect(view().getByRole("button", { name: "Delete preview" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    view().getByRole("button", { name: "Admit active and archive" }),
  ).toHaveProperty("disabled", true);
  extendRequest.resolve(previewFixture());
  await waitFor(() =>
    view().getByRole("button", { name: "Extend seven days" }),
  );
  expect(calls.extend).toEqual([{ previewId }]);

  const admissionRequest = deferred<unknown>();
  actions.admit = (input) => {
    calls.admit.push(input);
    return admissionRequest.promise;
  };
  await user.click(
    view().getByRole("button", { name: "Admit active and archive" }),
  );
  await waitFor(() =>
    view().getByRole("button", { name: "Admitting Source…" }),
  );
  expect(view().getByRole("button", { name: "Delete preview" })).toHaveProperty(
    "disabled",
    true,
  );
  admissionRequest.resolve(admittedFixture());
  await waitFor(() => view().getByText("Source admitted"));
  expect(calls.admit).toEqual([
    {
      previewId,
      observationKeys: ["submitted", "recommended-archive"],
    },
  ]);

  const deleteRequest = deferred<unknown>();
  actions.remove = (input) => {
    calls.delete.push(input);
    return deleteRequest.promise;
  };
  await user.click(view().getByRole("button", { name: "Delete preview" }));
  await waitFor(() => view().getByRole("button", { name: "Deleting…" }));
  expect(
    view().getByRole("button", { name: "Extend seven days" }),
  ).toHaveProperty("disabled", true);
  deleteRequest.resolve(undefined);
  await waitFor(() =>
    expect(view().queryByRole("button", { name: "Delete preview" })).toBeNull(),
  );
  expect(calls.delete).toEqual([{ previewId }]);
});

test("shows submission and lifecycle failures while retaining preview state", async () => {
  resetActions();
  const user = userEvent.setup();
  actions.submit = async () => {
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

  actions.submit = async (input) => {
    calls.submit.push(input);
    return previewFixture();
  };
  await user.type(view().getByLabelText("SEP URL"), "x");
  await user.click(view().getByRole("button", { name: "Create preview" }));
  await waitFor(() => view().getByText("Synthetic SEP entry"));
  actions.retry = async () => {
    throw new Error("Retry capture failed");
  };
  actions.get = async (input) => {
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

  actions.get = async () => {
    calls.get.push({ previewId });
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
  expect(calls.get).toHaveLength(2);

  actions.extend = async () => {
    throw new Error("Extension failed");
  };
  await user.click(view().getByRole("button", { name: "Extend seven days" }));
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain("Extension failed"),
  );
  expect(view().getByText("Refreshed synthetic SEP entry")).toBeTruthy();

  actions.remove = async () => {
    throw new Error("Deletion failed");
  };
  await user.click(view().getByRole("button", { name: "Delete preview" }));
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain("Deletion failed"),
  );
  expect(view().getByText("Refreshed synthetic SEP entry")).toBeTruthy();

  actions.admit = async () => {
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
