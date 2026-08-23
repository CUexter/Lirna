import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

import { readingFixture } from "../../routes/sources/-reading-test-fixtures";
import {
  AutoReferencedText,
  createReferenceIndex,
  ReferenceActions,
  referenceForAuthoredLink,
} from "./references";

function articleFixture() {
  const article = readingFixture().components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  return article;
}

test("indexes nested sections with hierarchical labels", () => {
  const index = createReferenceIndex(articleFixture());

  expect(index.byLabel.get("§2")?.targetId).toBe("referenced-claim");
  expect(index.byLabel.get("§2.1")?.targetId).toBe("nested-claim");
  expect(index.byLabel.get("§2.1.1")?.targetId).toBe("deeply-nested-claim");
});

test("jumps section references and opens numbered references", () => {
  const index = createReferenceIndex(articleFixture());
  const jumped: string[] = [];
  const opened: string[] = [];
  const view = render(
    <ReferenceActions.Provider
      value={{
        index,
        jump: (reference) => jumped.push(reference.targetId),
        open: (reference) => opened.push(reference.targetId),
      }}
    >
      <AutoReferencedText text="Compare §2.1 with (1)." />
    </ReferenceActions.Provider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Reference §2.1" }));
  fireEvent.click(view.getByRole("button", { name: "Reference (1)" }));

  expect(jumped).toEqual(["nested-claim"]);
  expect(opened).toEqual(["reading-reference-number-1"]);
});

test("resolves authored numbered labels through the reference index", () => {
  const article = articleFixture();
  const index = createReferenceIndex(article);

  const reference = referenceForAuthoredLink(
    index,
    { component: article, fragment: "unrelated-authored-target" },
    "(1)",
  );

  expect(reference?.targetId).toBe("reading-reference-number-1");
});

test("leaves authored section labels to anchor navigation", () => {
  const article = articleFixture();
  const index = createReferenceIndex(article);

  expect(
    referenceForAuthoredLink(
      index,
      { component: article, fragment: "nested-claim" },
      "§2.1",
    ),
  ).toBeUndefined();
});
