import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";

import {
  passageText,
  showInArticleElements,
  useShowInArticle,
} from "./useShowInArticle";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

test("describes and reveals a quoted passage with the bibliography effect", () => {
  const article = document.createElement("article");
  article.innerHTML = "<p>First <em>quoted passage</em>.</p><p>Second.</p>";
  document.body.append(article);
  const text = article.querySelector("em")?.firstChild;
  const paragraph = article.querySelector("p");
  if (!(text && paragraph)) throw new Error("Expected article passage");
  const range = document.createRange();
  range.selectNodeContents(text);

  expect(passageText(range)).toBe("quoted passage");
  expect(showInArticleElements(range)).toEqual([paragraph]);
  const { result } = renderHook(() => useShowInArticle());
  const passage = result.current(range);
  expect(passage.text).toBe("quoted passage");
  passage.show();
  expect(paragraph.classList.contains("authored-target-highlight")).toBe(true);
  fireEvent.animationEnd(paragraph);
  expect(paragraph.classList.contains("authored-target-highlight")).toBe(false);
});

test("returns deferred passage text with its reveal action", () => {
  let revealed = false;
  const { result } = renderHook(() => useShowInArticle());
  const passage = result.current({
    text: "Saved quoted passage",
    reveal: () => {
      revealed = true;
    },
  });

  expect(passage.text).toBe("Saved quoted passage");
  passage.show();
  expect(revealed).toBe(true);
});
