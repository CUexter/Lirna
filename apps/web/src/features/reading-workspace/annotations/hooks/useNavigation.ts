import { type RefObject, useEffect, useRef } from "react";
import { isReadingTargetReady } from "../../navigation/hooks/useNavigation";
import type {
  ReadingNavigation,
  ReadingNavigationHandle,
} from "../../navigation/model";
import type { Annotation, CitationResolution } from "../domUtils";
import {
  clearAnnotationTarget,
  paintAnnotationTarget,
  rangeFromAnchor,
} from "../domUtils";

export function useAnnotationNavigation({
  ...options
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  plainText: string;
}) {
  return useAnchoredTargetNavigation({ ...options, targetKind: "annotation" });
}

export function useAnchoredTargetNavigation({
  articleRef,
  componentIdentity,
  navigation,
  plainText,
  targetKind,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  plainText: string;
  targetKind: "annotation" | "citation-resolution";
}) {
  const annotationNavigation = useRef<ReadingNavigationHandle | undefined>(
    undefined,
  );
  const navigationFrame = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(navigationFrame.current);
      annotationNavigation.current?.cancel();
      clearAnnotationTarget();
    },
    [],
  );

  return (annotation: Annotation | CitationResolution) => {
    cancelAnimationFrame(navigationFrame.current);
    annotationNavigation.current?.cancel();
    const target = `${targetKind}:${componentIdentity}:${annotation.id}`;
    const handle = navigation.request({
      cause: "annotation-return",
      owner: "article",
      target,
    });
    annotationNavigation.current = handle;
    const moveWhenReady = () => {
      if (!handle.active()) return;
      const article = articleRef.current;
      if (!article) {
        navigationFrame.current = requestAnimationFrame(moveWhenReady);
        return;
      }
      const range = rangeFromAnchor(article, plainText, annotation);
      if (!range || range.toString() !== annotation.exactText) {
        handle.cancel();
        return;
      }
      if (!isReadingTargetReady(article)) {
        navigationFrame.current = requestAnimationFrame(moveWhenReady);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (
        handle.commit({
          behavior: "smooth",
          kind: "position",
          top:
            window.scrollY +
            rect.top +
            rect.height / 2 -
            window.innerHeight / 2,
        })
      ) {
        paintAnnotationTarget(range);
      }
    };
    navigationFrame.current = requestAnimationFrame(moveWhenReady);
  };
}
