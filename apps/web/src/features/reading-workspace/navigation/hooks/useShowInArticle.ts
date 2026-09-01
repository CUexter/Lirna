import { useCallback } from "react";

import { highlightTarget } from "../target";

const passageBlockSelector =
  "p, li, blockquote, figcaption, dt, dd, h1, h2, h3, h4, h5, h6";

type ArticleTarget = HTMLElement | Range;
type DeferredPassage = { text: string; reveal: () => void };
export type ShowInArticleSource = ArticleTarget | DeferredPassage;

export interface ArticlePassage {
  text: string;
  show: () => void;
}

export function useShowInArticle() {
  return useCallback((source: ShowInArticleSource): ArticlePassage => {
    if ("reveal" in source) return { text: source.text, show: source.reveal };
    return {
      text: passageText(source),
      show: () => {
        for (const element of showInArticleElements(source)) {
          highlightTarget(element);
        }
      },
    };
  }, []);
}

export function passageText(target: ArticleTarget) {
  const text =
    target instanceof HTMLElement ? target.textContent : target.toString();
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

export function showInArticleElements(target: ArticleTarget) {
  if (target instanceof HTMLElement) return [target];
  const startElement =
    target.startContainer instanceof HTMLElement
      ? target.startContainer
      : target.startContainer.parentElement;
  const article = startElement?.closest("article");
  if (!article) return startElement ? [startElement] : [];
  const intersecting = [
    ...article.querySelectorAll<HTMLElement>(passageBlockSelector),
  ].filter((element) => target.intersectsNode(element));
  return intersecting.filter(
    (element) =>
      !intersecting.some(
        (candidate) => candidate !== element && element.contains(candidate),
      ),
  );
}
