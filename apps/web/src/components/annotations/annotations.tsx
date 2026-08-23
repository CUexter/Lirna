import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { observeReadingNavigation } from "../reading-workspace/navigation-observations";
import type {
  ReadingNavigation,
  ReadingNavigationHandle,
} from "../reading-workspace/reading-navigation";
import { isReadingTargetReady } from "../reading-workspace/reading-navigation-hooks";
import {
  AnnotationPanelView,
  AnnotationRestingView,
  AnnotationSelectionView,
} from "./annotation-views";
import {
  type Annotation,
  clearAnnotationTarget,
  paintAnnotationTarget,
  rangeFromAnchor,
} from "./dom-utils";
import { useAnnotationActions } from "./use-annotation-actions";
import { useAnnotationDomEffects } from "./use-dom-effects";
import { useAnnotationQueries } from "./use-queries";
import { useAnnotationSelection } from "./use-selection";

export function ReadingAnnotations({
  articleRef,
  navigateToAnnotation,
  reading,
  resting,
  editAnnotationId,
  onEditAnnotationHandled,
}: {
  articleRef: RefObject<HTMLElement | null>;
  navigateToAnnotation: (annotation: Annotation) => void;
  reading: {
    componentIdentity: string;
    plainText: string;
    sourceId: string;
    stateId: string;
  };
  resting?: {
    tools?: ReactNode;
    showTools?: boolean;
  };
  editAnnotationId?: string;
  onEditAnnotationHandled?: () => void;
}) {
  const { componentIdentity, plainText, sourceId, stateId } = reading;
  const { tools: restingTools, showTools: showRestingTools = true } =
    resting ?? {};
  const q = useAnnotationQueries({ sourceId, stateId });
  const selection = useAnnotationSelection({
    articleRef,
    annotations: q.annotations,
    componentIdentity,
    sourceId,
    stateId,
    plainText,
  });
  const { state, dispatch } = selection;
  useAnnotationDomEffects({
    articleRef,
    annotations: q.annotations,
    componentIdentity,
    plainText,
  });

  const {
    closeMenu,
    closePanel,
    deleteAnnotation,
    openPanel,
    quickHighlight,
    saveAnnotation,
    setBody,
    setColor,
    setColorPickerOpen,
  } = useAnnotationActions({
    componentIdentity,
    dispatch,
    queries: q,
    state,
  });
  const annotations = q.annotations.filter(
    (annotation) => annotation.componentIdentity === componentIdentity,
  );
  const notes = annotations.filter((annotation) =>
    Boolean(annotation.body?.trim()),
  );

  useEffect(() => {
    if (!editAnnotationId) return;
    const annotation = annotations.find(
      (candidate) => candidate.id === editAnnotationId,
    );
    if (!annotation) return;
    dispatch({ type: "EDIT", annotation });
    onEditAnnotationHandled?.();
  }, [annotations, dispatch, editAnnotationId, onEditAnnotationHandled]);

  const view = {
    actions: {
      closeMenu,
      closePanel,
      deleteAnnotation,
      openPanel,
      quickHighlight,
      saveAnnotation,
      setBody,
      setColor,
      setColorPickerOpen,
    },
    annotations,
    articleRef,
    navigateToAnnotation,
    notes,
    plainText,
    queries: q,
    restingTools,
    showRestingTools,
    selection,
  };

  if (state.panelOpen) {
    return <AnnotationPanelView view={view} />;
  }

  if (!state.selection || !state.position) {
    return <AnnotationRestingView view={view} />;
  }

  return <AnnotationSelectionView view={view} />;
}

export function useAnnotationNavigation({
  articleRef,
  componentIdentity,
  navigation,
  plainText,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  plainText: string;
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

  return (annotation: Annotation) => {
    cancelAnimationFrame(navigationFrame.current);
    annotationNavigation.current?.cancel();
    const target = `annotation:${componentIdentity}:${annotation.id}`;
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
        handle.commit(() => {
          observeReadingNavigation({
            cause: "annotation-return",
            owner: "article",
            target,
          });
          window.scrollBy({
            behavior: "smooth",
            top: rect.top + rect.height / 2 - window.innerHeight / 2,
          });
        })
      ) {
        paintAnnotationTarget(range);
      }
    };
    navigationFrame.current = requestAnimationFrame(moveWhenReady);
  };
}
