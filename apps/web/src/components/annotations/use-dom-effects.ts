import { type RefObject, useEffect } from "react";

import type { Annotation, SelectionDraft } from "./dom-utils";
import { paintAnnotations, paintDraftSelection } from "./dom-utils";

export function useAnnotationDomEffects({
  articleRef,
  annotations,
  selection,
  componentIdentity,
  plainText,
}: {
  articleRef: RefObject<HTMLElement | null>;
  annotations: Annotation[];
  selection: SelectionDraft | undefined;
  componentIdentity: string;
  plainText: string;
}): void {
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    return paintAnnotations(
      article,
      annotations.filter(
        (annotation) => annotation.componentIdentity === componentIdentity,
      ),
      plainText,
    );
  }, [annotations, articleRef, componentIdentity, plainText]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !selection) return;
    return paintDraftSelection(article, selection, plainText);
  }, [selection, articleRef, plainText]);
}
