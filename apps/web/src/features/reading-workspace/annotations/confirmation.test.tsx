import { expect, test } from "bun:test";
import { act, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  annotation,
  calls,
  installCaretAt,
  openExistingAnnotation,
  queryClient,
  renderAnnotations,
  resetActions,
  selectExactText,
  setAnnotations,
  view,
} from "./test-support/harness";

test("replaces a selection without prompting but confirms deletion", async () => {
  resetActions(queryClient);
  const confirmations: string[] = [];
  window.confirm = (message) => {
    confirmations.push(String(message));
    return false;
  };
  const user = userEvent.setup();
  await renderAnnotations();
  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.type(view().getByLabelText("Annotation note"), "Keep this draft.");
  fireEvent.blur(view().getByLabelText("Annotation note"));

  const article = view().getByText("A synthetic Source state passage.");
  article.tabIndex = -1;
  article.focus();
  const sameSelection = document.createRange();
  sameSelection.setStart(article.firstChild as Text, 2);
  sameSelection.setEnd(article.firstChild as Text, 11);
  await act(async () => {
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(sameSelection);
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(confirmations).toEqual([]);
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "Keep this draft.",
  );

  const replacement = document.createRange();
  replacement.setStart(article.firstChild as Text, 12);
  replacement.setEnd(article.firstChild as Text, 18);
  await act(async () => {
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(replacement);
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(confirmations).toEqual([]);
  expect(view().getByLabelText("Annotation note")).toHaveProperty("value", "");

  cleanup();
  localStorage.clear();
  queryClient.clear();
  calls.list.length = 0;
  setAnnotations([annotation()]);
  await renderAnnotations();
  await openExistingAnnotation();
  await user.click(view().getByRole("button", { name: "Delete annotation" }));
  expect(confirmations).toContain("Delete this annotation?");
  expect(calls.delete).toEqual([]);
});

test("opens an existing annotation without prompting over a draft", async () => {
  resetActions(queryClient);
  setAnnotations([annotation()]);
  const confirmations: string[] = [];
  window.confirm = (message) => {
    confirmations.push(String(message));
    return false;
  };
  const user = userEvent.setup();
  await renderAnnotations();
  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.type(view().getByLabelText("Annotation note"), "Keep this draft.");

  const article = view().getByText("A synthetic Source state passage.");
  const restoreCaret = installCaretAt(article.firstChild as Text);
  await act(async () => {
    window.getSelection()?.removeAllRanges();
    fireEvent.pointerUp(article);
  });
  restoreCaret();

  expect(confirmations).toEqual([]);
  expect(
    view().getByRole("complementary", { name: "Edit annotation" }),
  ).toBeTruthy();
  expect(view().getByLabelText("Annotation note")).toHaveProperty("value", "");
});
