import { expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import {
  bibliographyRouteState,
  citationResolutionCalls,
  renderReading,
  view,
} from "./reading-route-test-harness";
import {
  captureScrollIntoView,
  returnFromArticleBibliography,
  setupReadingUser,
} from "./reading-route-test-scenarios";
import { sourceId, stateId } from "./reading-test-fixtures";

test("restores an unfinished annotation draft after visiting a Citation", async () => {
  const user = setupReadingUser();
  const scroll = captureScrollIntoView();
  try {
    await renderReading("?component=article");
    localStorage.clear();
    const passage = await view().findByText(
      "A synthetic Source state passage.",
    );
    const text = passage.firstChild;
    if (!(text instanceof Text)) throw new Error("Missing passage text");
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 11);
    await act(async () => {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await user.click(await view().findByRole("button", { name: "Add note" }));
    const note = view().getByRole("textbox", { name: "Annotation note" });
    await user.type(note, "Unfinished synthesis");
    await waitFor(() =>
      expect(
        localStorage.getItem(
          `lirna:annotation-draft:${sourceId}:${stateId}:article`,
        ),
      ).toContain("Unfinished synthesis"),
    );

    await user.click(
      view().getByRole("button", { name: "Citation: [1] (resolved)" }),
    );
    await user.click(await view().findByRole("button", { name: "Leave" }));
    await view().findByRole("region", { name: "Bibliography" });
    expect(
      view().queryByRole("textbox", { name: "Annotation note" }),
    ).toBeNull();
    expect(document.getElementById("article:entry-one")).not.toBeNull();
    await returnFromArticleBibliography(user);
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(scroll.target).toBe("citation-one");
    const restored = await view().findByRole("textbox", {
      name: "Annotation note",
    });
    expect((restored as HTMLTextAreaElement).value).toBe(
      "Unfinished synthesis",
    );
  } finally {
    scroll.restore();
  }
});

test("manually resolves only a server-supplied Citation candidate", async () => {
  bibliographyRouteState.citationEvidence = [mentionEvidence()];
  const user = setupReadingUser();
  await renderReading("?component=article");
  await user.click(
    await view().findByRole("button", { name: "Citation: [1] (resolved)" }),
  );
  await user.click(
    await view().findByRole("button", {
      name: "Select this candidate manually",
    }),
  );

  await waitFor(() => expect(citationResolutionCalls).toHaveLength(1));
  expect(citationResolutionCalls[0]).toEqual({
    sourceId,
    stateId,
    componentIdentity: "article",
    mentionId: "citation-one",
    bibliographyComponentIdentity: "article",
    bibliographyEntryId: "entry-one",
    method: "manual",
  });
});

function mentionEvidence() {
  return {
    id: "60000000-0000-4000-8000-000000000000:article:citation-one",
    sourceId,
    sourceStateId: stateId,
    derivativeId: "60000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    mentionId: "citation-one",
    label: "[1]",
    context: "Synthetic publication content [1]",
    state: "ambiguous",
    deterministicReason: "The authored label has bounded candidates.",
    candidates: [
      {
        id: "article:entry-one",
        bibliographyComponentIdentity: "article",
        bibliographyEntryId: "entry-one",
        label: "[1]",
        text: "Ada Lovelace. Synthetic publisher entry.",
        reason: "The authored label matched this candidate.",
      },
    ],
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
      inferenceEligible: true,
    },
  };
}
