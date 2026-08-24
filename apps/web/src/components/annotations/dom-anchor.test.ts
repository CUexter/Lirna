import { expect, test } from "bun:test";

import { anchorForRange, rangeFromAnchor } from "./dom-utils";

test("only supplies a publisher anchor that contains the complete range", () => {
  const article = document.createElement("article");
  article.innerHTML =
    '<section id="first">First passage</section><section id="second">Second passage</section>';
  document.body.append(article);
  const first = article.querySelector("#first")?.firstChild as Text;
  const second = article.querySelector("#second")?.firstChild as Text;

  const contained = document.createRange();
  contained.setStart(first, 0);
  contained.setEnd(first, 5);
  expect(
    anchorForRange(article, contained, article.textContent ?? ""),
  ).toMatchObject({ publisherAnchor: "first" });

  const crossing = document.createRange();
  crossing.setStart(first, 6);
  crossing.setEnd(second, 6);
  expect(
    anchorForRange(article, crossing, article.textContent ?? "")
      ?.publisherAnchor,
  ).toBeUndefined();
});

test("relocates a repeated passage using its persisted context", () => {
  const article = document.createElement("article");
  article.textContent = "First Lewis 1986 context. Later Lewis 1986 evidence.";
  const plainText = "Lewis 1986 context. Later Lewis 1986 evidence.";

  const range = rangeFromAnchor(article, plainText, {
    normalizedStartOffset: 26,
    normalizedEndOffset: 36,
    exactText: "Lewis 1986",
    prefix: "context. Later ",
    suffix: " evidence.",
  });

  expect(range?.toString()).toBe("Lewis 1986");
  expect(range?.startOffset).toBe(32);
});
