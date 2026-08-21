import { expect, test } from "bun:test";

import { anchorForRange } from "./dom-utils";

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
