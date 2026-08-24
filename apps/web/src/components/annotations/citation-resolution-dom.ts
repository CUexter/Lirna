import { type RefObject, useEffect } from "react";
import { type CitationResolution, rangeFromAnchor } from "./dom-utils";

const highlightName = "lirna-citation-resolution";
export const citationResolutionStyleContent = `::highlight(${highlightName}) { color: var(--primary); text-decoration: underline; }`;

export function useCitationResolutionHighlights({
  articleRef,
  componentIdentity,
  plainText,
  resolutions,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  plainText: string;
  resolutions: CitationResolution[];
}) {
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    return paintCitationResolutions(
      article,
      resolutions.filter(
        (resolution) => resolution.componentIdentity === componentIdentity,
      ),
      plainText,
    );
  }, [articleRef, componentIdentity, plainText, resolutions]);
}

function paintCitationResolutions(
  article: HTMLElement,
  resolutions: CitationResolution[],
  plainText = article.textContent ?? "",
) {
  const registry = customHighlightRegistry();
  const HighlightConstructor = customHighlightConstructor();
  if (!registry || !HighlightConstructor) return undefined;
  registry.delete(highlightName);
  const ranges = resolutions.flatMap((resolution) => {
    const range = rangeFromAnchor(article, plainText, resolution);
    return range?.toString() === resolution.exactText ? [range] : [];
  });
  if (ranges.length) {
    registry.set(highlightName, new HighlightConstructor(...ranges));
  }
  return () => {
    registry.delete(highlightName);
  };
}

function customHighlightRegistry() {
  return (
    CSS as typeof CSS & {
      highlights?: {
        set(name: string, value: unknown): void;
        delete(name: string): void;
      };
    }
  ).highlights;
}

function customHighlightConstructor() {
  return (
    window as typeof window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }
  ).Highlight;
}
