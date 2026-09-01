import { type RefObject, useEffect, useRef } from "react";
import { isReadingTargetReady } from "../../navigation/hooks/useNavigation";
import {
  type ArticlePassage,
  type ShowInArticleSource,
  useShowInArticle,
} from "../../navigation/hooks/useShowInArticle";
import type {
  ReadingNavigation,
  ReadingNavigationHandle,
} from "../../navigation/model";
import type {
  Annotation,
  CitationResolution,
  SelectionDraft,
} from "../domUtils";
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

export function useResearchSelectionNavigation({
  activeComponentIdentity,
  articleRef,
  navigation,
  onComponentChange,
}: {
  activeComponentIdentity: string;
  articleRef: RefObject<HTMLElement | null>;
  navigation: ReadingNavigation;
  onComponentChange: (componentIdentity: string) => void;
}) {
  const showInArticle = useShowInArticle();
  const navigate = useAnchoredTargetNavigation({
    articleRef,
    componentIdentity: "",
    navigation,
    plainText: "",
    showInArticle,
    targetKind: "research-selection",
  });
  return ({
    componentIdentity,
    plainText,
    selection,
  }: {
    componentIdentity: string;
    plainText: string;
    selection: SelectionDraft;
  }): ArticlePassage =>
    showInArticle({
      text: selection.exactText,
      reveal: () => {
        if (componentIdentity !== activeComponentIdentity) {
          onComponentChange(componentIdentity);
        }
        navigate(
          { ...selection, id: "research-assistant-selection" },
          { componentIdentity, plainText },
        );
      },
    });
}

export function useAnchoredTargetNavigation({
  articleRef,
  componentIdentity,
  navigation,
  plainText,
  showInArticle,
  targetKind,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  plainText: string;
  showInArticle?: (target: ShowInArticleSource) => ArticlePassage;
  targetKind: "annotation" | "citation-resolution" | "research-selection";
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

  return (
    annotation:
      | Annotation
      | CitationResolution
      | (SelectionDraft & { id: string }),
    targetOverride?: { componentIdentity: string; plainText: string },
  ) => {
    cancelAnimationFrame(navigationFrame.current);
    annotationNavigation.current?.cancel();
    const targetComponentIdentity =
      targetOverride?.componentIdentity ?? componentIdentity;
    const targetPlainText = targetOverride?.plainText ?? plainText;
    const target = `${targetKind}:${targetComponentIdentity}:${annotation.id}`;
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
      const range = rangeFromAnchor(article, targetPlainText, annotation);
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
        if (showInArticle) showInArticle(range).show();
        else paintAnnotationTarget(range);
      }
    };
    navigationFrame.current = requestAnimationFrame(moveWhenReady);
  };
}
