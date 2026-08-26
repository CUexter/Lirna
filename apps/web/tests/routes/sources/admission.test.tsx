import { expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  actions,
  calls,
  renderAdmission,
  resetActions,
  view,
} from "@/components/source-admission/admission-test-harness";

test("wires an HTTPS URL submission to an Admission preview", async () => {
  resetActions();
  const user = userEvent.setup();
  await renderAdmission();

  await user.click(view().getByRole("button", { name: "Create preview" }));
  expect(view().getByRole("alert").textContent).toContain("complete URL");

  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));

  await waitFor(() => view().getByText("Synthetic SEP entry"));
  expect(calls.submit).toEqual([
    { url: "https://plato.stanford.edu/entries/test/" },
  ]);
});

test("renders the searchable request reference returned by Admission", async () => {
  resetActions();
  const user = userEvent.setup();
  actions.submit = async () => {
    throw Object.assign(new Error("Preview failed"), {
      data: { requestId: "req-test" },
    });
  };
  await renderAdmission();

  await user.type(
    view().getByLabelText("SEP URL"),
    "https://plato.stanford.edu/entries/test/",
  );
  await user.click(view().getByRole("button", { name: "Create preview" }));

  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Error reference: req-test",
    ),
  );
});
