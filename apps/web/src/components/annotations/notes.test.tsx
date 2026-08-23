import { expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";

import {
  annotation,
  queryClient,
  renderAnnotations,
  resetActions,
  setAnnotations,
  view,
} from "./test-harness";

test("lists notes and highlights, navigates from an item, and edits explicitly", async () => {
  resetActions(queryClient);
  setAnnotations([
    annotation({ body: "A saved note." }),
    annotation({ id: "highlight-only", body: null }),
    annotation({
      id: "other-component",
      componentIdentity: "supplement",
      body: "A note from another component.",
    }),
  ]);
  const user = userEvent.setup();
  await renderAnnotations();

  await user.click(view().getByRole("button", { name: "View notes" }));

  expect(view().getByRole("complementary", { name: "Notes" })).toBeTruthy();
  expect(view().getByText("A saved note.")).toBeTruthy();
  expect(view().getByText("Highlight")).toBeTruthy();
  expect(view().queryByText("A note from another component.")).toBeNull();
  await user.click(view().getByRole("button", { name: /A saved note/ }));
  expect(view().queryByLabelText("Annotation note")).toBeNull();

  await user.click(view().getByRole("button", { name: "Edit note" }));
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "A saved note.",
  );
});

test("jumps from a side-panel note to its exact highlighted passage", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "A saved note." })]);
  const scrollTo = mock(() => undefined);
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "scrollTo",
  );
  const rangeRectDescriptor = Object.getOwnPropertyDescriptor(
    Range.prototype,
    "getBoundingClientRect",
  );
  const innerHeightDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight",
  );
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ height: 20, top: 600 }),
  });

  try {
    const initialScrollY = window.scrollY;
    const user = userEvent.setup();
    await renderAnnotations();
    await user.click(view().getByRole("button", { name: "View notes" }));
    await user.click(view().getByRole("button", { name: /A saved note/ }));

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      top: initialScrollY + 210,
    });
  } finally {
    if (scrollToDescriptor)
      Object.defineProperty(window, "scrollTo", scrollToDescriptor);
    if (rangeRectDescriptor)
      Object.defineProperty(
        Range.prototype,
        "getBoundingClientRect",
        rangeRectDescriptor,
      );
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    if (innerHeightDescriptor)
      Object.defineProperty(window, "innerHeight", innerHeightDescriptor);
  }
});

test("hides a callout after its highlighted passage leaves the viewport", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "A saved note." })]);
  const rangeRectDescriptor = Object.getOwnPropertyDescriptor(
    Range.prototype,
    "getBoundingClientRect",
  );
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: -80, height: 20, top: -100 }),
  });

  try {
    await renderAnnotations();
    expect(view().queryByRole("button", { name: /A saved note/ })).toBeNull();
  } finally {
    if (rangeRectDescriptor)
      Object.defineProperty(
        Range.prototype,
        "getBoundingClientRect",
        rangeRectDescriptor,
      );
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  }
});
