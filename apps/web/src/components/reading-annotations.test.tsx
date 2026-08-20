import { expect, mock, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";

import {
  actions,
  annotation,
  annotationInput,
  calls,
  componentIdentity,
  installCaretAt,
  installHighlightApi,
  mutationOptions,
  resetActions,
  selectExactText,
  setAnnotations,
  sourceId,
  stateId,
} from "./reading-annotations-test-support";

await mock.module("@/clients/library", () => ({
  library: {
    annotations: {
      list: {
        key: ({ input }: { input: typeof annotationInput }) => [
          "annotations",
          input,
        ],
        queryOptions: ({ input }: { input: typeof annotationInput }) => ({
          queryKey: ["annotations", input],
          queryFn: () => actions.list(input),
        }),
      },
      create: { mutationOptions: () => mutationOptions(() => actions.create) },
      update: { mutationOptions: () => mutationOptions(() => actions.update) },
      delete: { mutationOptions: () => mutationOptions(() => actions.remove) },
    },
  },
}));

const { ReadingAnnotations } = await import("./reading-annotations");
const { queryClient } = await import("@/utils/query-client");

function view() {
  return within(document.body);
}

function AnnotationSurface() {
  const articleRef = useRef<HTMLElement>(null);
  return (
    <>
      <article ref={articleRef}>A synthetic Source state passage.</article>
      <ReadingAnnotations
        articleRef={articleRef}
        componentIdentity={componentIdentity}
        sourceId={sourceId}
        stateId={stateId}
      />
    </>
  );
}

async function renderAnnotations() {
  render(
    <QueryClientProvider client={queryClient}>
      <AnnotationSurface />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(calls.list).toEqual([annotationInput]));
}

async function openExistingAnnotation() {
  const article = view().getByText("A synthetic Source state passage.");
  const restoreCaret = installCaretAt(article.firstChild as Text);
  window.getSelection()?.removeAllRanges();
  await act(async () => {
    fireEvent.pointerUp(article);
  });
  await waitFor(() =>
    expect(
      view().getByRole("complementary", { name: "Edit annotation" }),
    ).toBeTruthy(),
  );
  restoreCaret();
}

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
    startOffset: 2,
    endOffset: 11,
    exactText: "synthetic",
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
    startOffset: 2,
    endOffset: 11,
    exactText: "synthetic",
    color: "yellow",
    body: "A durable note.",
  });
});

test("scopes active component annotations, ignores stale text, updates, and deletes", async () => {
  resetActions(queryClient);
  setAnnotations([
    annotation({
      id: "other-component",
      componentIdentity: "supplement",
      body: "Do not open this annotation.",
    }),
    annotation({ body: "Original note." }),
    annotation({
      id: "stale",
      startOffset: 12,
      endOffset: 18,
      exactText: "stale",
    }),
  ]);
  const highlights = installHighlightApi();
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
        ...annotationInput,
        id: "annotation-1",
        color: "green",
        body: "Revised note.",
      },
    ]),
  );

  await openExistingAnnotation();
  await user.click(view().getByRole("button", { name: "Delete annotation" }));
  await waitFor(() =>
    expect(calls.delete).toEqual([{ ...annotationInput, id: "annotation-1" }]),
  );
  highlights.restore();
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
