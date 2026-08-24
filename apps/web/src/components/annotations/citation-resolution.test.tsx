import { expect, mock, test } from "bun:test";
import { act, fireEvent, waitFor } from "@testing-library/react";

import {
  annotationInput,
  componentIdentity,
  installCaretAt,
  installHighlightApi,
  queryClient,
  renderAnnotations,
  resetActions,
  view,
} from "./test-harness";

test("keeps manually resolved citations in the article flow", async () => {
  resetActions(queryClient);
  const onOpenCitationResolution = mock();
  const highlights = installHighlightApi();
  try {
    await renderAnnotations({
      citationResolutions: [
        {
          id: "resolution-1",
          sourceId: annotationInput.sourceId,
          sourceStateId: annotationInput.stateId,
          derivativeId: "derivative-1",
          componentIdentity,
          mentionId: "citation-mention-1",
          bibliographyComponentIdentity: componentIdentity,
          bibliographyEntryId: "entry-1",
          publisherAnchor: null,
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 2,
          normalizedEndOffset: 11,
          exactText: "synthetic",
          prefix: "A ",
          suffix: " Source state passage.",
          actorId: "actor-1",
          method: "manual",
          confidence: null,
          reasoning: null,
          createdAt: "2026-08-24T00:00:00.000Z",
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
      ],
      onOpenCitationResolution,
      unmountAnnotationsOnOpen: true,
    });

    expect(
      view().queryByRole("button", {
        name: "Citation: synthetic (resolved)",
      }),
    ).toBeNull();
    expect(
      highlights.registry
        .get("lirna-citation-resolution")
        ?.ranges[0]?.toString(),
    ).toBe("synthetic");
    const styles = Array.from(
      document.querySelectorAll("style"),
      (style) => style.textContent,
    ).join("\n");
    expect(styles).toContain(
      "::highlight(lirna-citation-resolution) { color: var(--primary);",
    );
    expect(styles).not.toContain(
      "::highlight(lirna-citation-resolution) { color: transparent;",
    );

    const article = view().getByText("A synthetic Source state passage.");
    const restoreCaret = installCaretAt(article.firstChild as Text);
    await act(async () => {
      window.getSelection()?.removeAllRanges();
      fireEvent.pointerUp(article);
    });
    restoreCaret();
    expect(onOpenCitationResolution).toHaveBeenCalledWith(
      "entry-1",
      "resolution-1",
      componentIdentity,
    );
    await waitFor(() =>
      expect(
        highlights.registry
          .get("lirna-citation-resolution")
          ?.ranges[0]?.toString(),
      ).toBe("synthetic"),
    );
  } finally {
    highlights.restore();
  }
});
