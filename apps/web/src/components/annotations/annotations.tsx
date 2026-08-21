import type { RefObject } from "react";
import {
  AnnotationPanelView,
  AnnotationRestingView,
  AnnotationSelectionView,
} from "./annotation-views";
import { type Annotation, rangeFromAnchor } from "./dom-utils";
import { useAnnotationActions } from "./use-annotation-actions";
import { useAnnotationDomEffects } from "./use-dom-effects";
import { useAnnotationQueries } from "./use-queries";
import { useAnnotationSelection } from "./use-selection";

export function ReadingAnnotations({
  articleRef,
  sourceId,
  stateId,
  componentIdentity,
  plainText,
}: {
  articleRef: RefObject<HTMLElement | null>;
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  plainText: string;
}) {
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
    selection: state.selection,
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

  const navigateToAnnotation = (annotation: Annotation) => {
    const article = articleRef.current;
    const range = article
      ? rangeFromAnchor(article, plainText, annotation)
      : undefined;
    if (!range || range.toString() !== annotation.exactText) return;
    const rect = range.getBoundingClientRect();
    window.scrollBy({
      behavior: "smooth",
      top: rect.top + rect.height / 2 - window.innerHeight / 2,
    });
  };

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
