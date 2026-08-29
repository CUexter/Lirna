import { expect, test } from "bun:test";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  actions,
  annotation,
  annotationInput,
  calls,
  componentIdentity,
  installHighlightApi,
  openExistingAnnotation,
  queryClient,
  renderAnnotations,
  resetActions,
  selectExactText,
  setAnnotations,
  view,
} from "../test-support/harness";

test("creates bodyless and noted Annotations through exact-text controls", async () => {
  resetActions(queryClient);
  const user = userEvent.setup();
  await renderAnnotations();
  await selectExactText();

  await user.click(view().getByRole("button", { name: "Quick highlight" }));
  await user.click(view().getByRole("button", { name: "blue highlight" }));
  await waitFor(() => expect(calls.create).toHaveLength(1));
  expect(calls.create[0]).toEqual({
    ...annotationInput,
    componentIdentity,
    kind: "highlight",
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 2,
    normalizedEndOffset: 11,
    exactText: "synthetic",
    prefix: "A ",
    suffix: " Source state passage.",
    color: "blue",
    body: "",
  });

  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.type(view().getByLabelText("Annotation note"), "A durable note.");
  await user.click(view().getByRole("button", { name: "Highlight" }));
  await waitFor(() => expect(calls.create).toHaveLength(2));
  expect(calls.create[1]).toEqual({
    ...annotationInput,
    componentIdentity,
    kind: "note",
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 2,
    normalizedEndOffset: 11,
    exactText: "synthetic",
    prefix: "A ",
    suffix: " Source state passage.",
    color: "yellow",
    body: "A durable note.",
  });
});

test("does not highlight text until the reader explicitly creates an Annotation", async () => {
  resetActions(queryClient);
  const highlights = installHighlightApi();
  try {
    await renderAnnotations();
    await selectExactText();

    expect(highlights.registry.has("lirna-annotation-draft")).toBe(false);
  } finally {
    highlights.restore();
  }
});

test("scopes active component annotations, ignores stale text, updates, and deletes", async () => {
  resetActions(queryClient);
  const existingAnnotations = [
    annotation({
      id: "other-component",
      componentIdentity: "supplement",
      body: "Do not open this annotation.",
    }),
    annotation({ body: "Original note." }),
    annotation({
      id: "stale",
      normalizedStartOffset: 12,
      normalizedEndOffset: 18,
      exactText: "stale",
    }),
  ];
  setAnnotations(existingAnnotations);
  actions.update = async (input) => {
    calls.update.push(input);
    setAnnotations(
      existingAnnotations.map((existing) =>
        existing.id === "annotation-1"
          ? annotation({ color: "green", body: "Revised note." })
          : existing,
      ),
    );
  };
  const highlights = installHighlightApi();
  try {
    const user = userEvent.setup();
    await renderAnnotations();
    await waitFor(() =>
      expect(
        highlights.registry.get("lirna-annotation-yellow")?.ranges,
      ).toHaveLength(1),
    );
    expect(
      highlights.registry.get("lirna-annotation-yellow")?.ranges[0]?.toString(),
    ).toBe("synthetic");
    await openExistingAnnotation();

    expect(view().getByLabelText("Annotation note")).toHaveProperty(
      "value",
      "Original note.",
    );
    await user.click(view().getByRole("button", { name: "green highlight" }));
    await user.clear(view().getByLabelText("Annotation note"));
    await user.type(view().getByLabelText("Annotation note"), "Revised note.");
    await user.click(view().getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.update).toEqual([
        {
          id: "annotation-1",
          color: "green",
          kind: "note",
          body: "Revised note.",
        },
      ]),
    );
    await waitFor(() => expect(calls.list).toHaveLength(2));
    await waitFor(() =>
      expect(
        highlights.registry.get("lirna-annotation-green")?.ranges,
      ).toHaveLength(1),
    );

    await openExistingAnnotation();
    expect(
      view()
        .getByRole("button", { name: "green highlight" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(view().getByLabelText("Annotation note")).toHaveProperty(
      "value",
      "Revised note.",
    );
    await user.click(view().getByRole("button", { name: "Delete annotation" }));
    await waitFor(() => expect(calls.delete).toEqual([{ id: "annotation-1" }]));
  } finally {
    highlights.restore();
  }
});

test("keeps visible selection and editing state when list and mutations fail", async () => {
  resetActions(queryClient);
  actions.list = async (input) => {
    calls.list.push(input);
    throw new Error("Annotations are unavailable");
  };
  const user = userEvent.setup();
  await renderAnnotations();
  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Annotations are unavailable",
    ),
  );
  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.type(view().getByLabelText("Annotation note"), "Keep this draft.");
  actions.create = async (input) => {
    calls.create.push(input);
    throw new Error("Could not save annotation");
  };
  await user.click(view().getByRole("button", { name: "Highlight" }));
  await waitFor(() =>
    expect(view().getAllByRole("alert").at(-1)?.textContent).toContain(
      "Could not save annotation",
    ),
  );
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "Keep this draft.",
  );
});

test("keeps the annotation editor open when an update fails", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "Original note." })]);
  actions.update = async (input) => {
    calls.update.push(input);
    throw new Error("Could not update annotation");
  };
  const user = userEvent.setup();
  await renderAnnotations();
  await openExistingAnnotation();
  await user.clear(view().getByLabelText("Annotation note"));
  await user.type(view().getByLabelText("Annotation note"), "Keep this edit.");
  await user.click(view().getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Could not update annotation",
    ),
  );
  expect(
    view().getByRole("complementary", { name: "Edit annotation" }),
  ).toBeTruthy();
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "Keep this edit.",
  );
});

test("keeps the annotation editor open when deletion fails", async () => {
  resetActions(queryClient);
  setAnnotations([annotation({ body: "Keep this annotation." })]);
  actions.remove = async (input) => {
    calls.delete.push(input);
    throw new Error("Could not delete annotation");
  };
  const user = userEvent.setup();
  await renderAnnotations();
  await openExistingAnnotation();
  await user.click(view().getByRole("button", { name: "Delete annotation" }));

  await waitFor(() =>
    expect(view().getByRole("alert").textContent).toContain(
      "Could not delete annotation",
    ),
  );
  expect(
    view().getByRole("complementary", { name: "Edit annotation" }),
  ).toBeTruthy();
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "Keep this annotation.",
  );
});

test("restores an unsaved draft after the annotation surface reloads", async () => {
  resetActions(queryClient);
  const user = userEvent.setup();
  await renderAnnotations();
  await selectExactText();
  await user.click(view().getByRole("button", { name: "Add note" }));
  await user.type(
    view().getByLabelText("Annotation note"),
    "Resume this draft.",
  );

  cleanup();
  queryClient.clear();
  calls.list.length = 0;
  await renderAnnotations();

  expect(
    view().getByRole("complementary", { name: "Create annotation" }),
  ).toBeTruthy();
  expect(view().getByLabelText("Annotation note")).toHaveProperty(
    "value",
    "Resume this draft.",
  );
});
