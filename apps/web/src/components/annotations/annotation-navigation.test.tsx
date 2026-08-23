import { expect, test } from "bun:test";
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  annotation,
  installHighlightApi,
  queryClient,
  renderAnnotations,
  resetActions,
  selectExactText,
  setAnnotations,
  view,
} from "./test-harness";

test("returns to only the winning Annotation mention through ReadingNavigation", async () => {
  resetActions(queryClient);
  setAnnotations([
    annotation({ body: "Return to synthetic." }),
    annotation({
      body: "Return to Source.",
      exactText: "Source",
      id: "annotation-2",
      normalizedEndOffset: 18,
      normalizedStartOffset: 12,
      prefix: "A synthetic ",
      suffix: " state passage.",
    }),
  ]);
  const highlights = installHighlightApi();
  const observations: Array<{ cause: string; owner: string; target: string }> =
    [];
  const onNavigation = (event: Event) => {
    const detail = (
      event as CustomEvent<{ cause: string; owner: string; target: string }>
    ).detail;
    observations.push(detail);
  };
  const originalScrollTo = window.scrollTo;
  const moves: ScrollToOptions[] = [];
  window.addEventListener("lirna:reading-navigation", onNavigation);
  window.scrollTo = (options) => {
    if (typeof options === "object") moves.push(options);
  };

  try {
    const user = userEvent.setup();
    await renderAnnotations();
    await selectExactText();
    await user.click(view().getByRole("button", { name: "Add note" }));
    await user.click(view().getByRole("tab", { name: "Notes" }));
    const [first, second] = view().getAllByRole("button", {
      name: /Return to (synthetic|Source)/,
    });
    if (!(first && second))
      throw new Error("Annotation notes were not rendered");
    fireEvent.click(first);
    fireEvent.click(second);

    await waitFor(() => expect(moves).toHaveLength(1));
    expect(observations).toEqual([
      expect.objectContaining({
        cause: "annotation-return",
        owner: "article",
        target: "annotation:article:annotation-2",
      }),
    ]);
    expect(
      highlights.registry.get("lirna-annotation-target")?.ranges[0]?.toString(),
    ).toBe("Source");
  } finally {
    window.scrollTo = originalScrollTo;
    window.removeEventListener("lirna:reading-navigation", onNavigation);
    highlights.restore();
  }
});
