import { expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  actions,
  annotation,
  calls,
  openExistingAnnotation,
  queryClient,
  renderAnnotations,
  resetActions,
  selectExactText,
  setAnnotations,
  view,
} from "./test-harness";

test("disables create controls while its call is pending", async () => {
  resetActions(queryClient);
  const user = userEvent.setup();
  actions.create = (input) => {
    calls.create.push(input);
    return new Promise(() => undefined);
  };
  await renderAnnotations();
  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.click(view().getByRole("button", { name: "Highlight" }));
  await waitFor(() =>
    expect(view().getByRole("button", { name: "Highlight" })).toHaveProperty(
      "disabled",
      true,
    ),
  );
  expect(view().getByRole("button", { name: "Cancel" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    view().getByRole("button", { name: "yellow highlight" }),
  ).toHaveProperty("disabled", true);
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "disabled",
    true,
  );
});

test("disables update controls while its call is pending", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "Original note." })]);
  const user = userEvent.setup();
  actions.update = (input) => {
    calls.update.push(input);
    return new Promise(() => undefined);
  };
  await renderAnnotations();
  await openExistingAnnotation();
  await user.click(view().getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(view().getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    ),
  );
  expect(
    view().getByRole("button", { name: "Delete annotation" }),
  ).toHaveProperty("disabled", true);
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "disabled",
    true,
  );
});

test("disables delete controls while its call is pending", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "Original note." })]);
  const user = userEvent.setup();
  actions.remove = (input) => {
    calls.delete.push(input);
    return new Promise(() => undefined);
  };
  await renderAnnotations();
  await openExistingAnnotation();
  await user.click(view().getByRole("button", { name: "Delete annotation" }));
  await waitFor(() =>
    expect(
      view().getByRole("button", { name: "Delete annotation" }),
    ).toHaveProperty("disabled", true),
  );
  expect(view().getByRole("button", { name: "Save" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "disabled",
    true,
  );
});
