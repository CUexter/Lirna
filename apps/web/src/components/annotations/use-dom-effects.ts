import { type RefObject, useEffect } from "react";

import type { Annotation, SelectionDraft } from "./dom-utils";
import { paintAnnotations, paintDraftSelection } from "./dom-utils";

export function useAnnotationDomEffects(
  articleRef: RefObject<HTMLElement | null>,
  annotations: Annotation[],
  selection: SelectionDraft | undefined,
  componentIdentity: string,
): void {
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    return paintAnnotations(
      article,
      annotations.filter(
        (annotation) => annotation.componentIdentity === componentIdentity,
      ),
    );
  }, [annotations, articleRef, componentIdentity]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !selection) return;
    return paintDraftSelection(article, selection);
  }, [selection, articleRef]);
}
