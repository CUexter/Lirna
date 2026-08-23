import { type RefObject, useEffect } from "react";

import type { Annotation } from "./dom-utils";
import { paintAnnotations } from "./dom-utils";

export function useAnnotationDomEffects({
  articleRef,
  annotations,
  componentIdentity,
  plainText,
}: {
  articleRef: RefObject<HTMLElement | null>;
  annotations: Annotation[];
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
}
