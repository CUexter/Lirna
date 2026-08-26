import { type ReactNode, type RefObject, useEffect, useRef } from "react";
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
import type { CitationResolution, SelectionDraft } from "./dom-utils";
import {
  type Annotation,
  clearAnnotationTarget,
  paintAnnotationTarget,
  rangeFromAnchor,
} from "./dom-utils";
import { useAnnotationActions } from "./use-annotation-actions";
import { useAnnotationDomEffects } from "./use-dom-effects";
import { useAnnotationQueries } from "./use-queries";
import {
  hasUnsavedAnnotationChanges,
  useAnnotationSelection,
} from "./use-selection";

export function ReadingAnnotations({
  articleRef,
  navigateToAnnotation,
  reading,
  resting,
  editAnnotationId,
  onEditAnnotationHandled,
  onLinkBibliography,
  onOpenCitationResolution,
  onUnsavedChange,
}: {
  articleRef: RefObject<HTMLElement | null>;
  navigateToAnnotation: (annotation: Annotation) => void;
  reading: {
    componentIdentity: string;
    plainText: string;
    sourceId: string;
    stateId: string;
    citationResolutions?: CitationResolution[];
  };
  resting?: {
    tools?: ReactNode;
    showTools?: boolean;
  };
  editAnnotationId?: string;
  onEditAnnotationHandled?: () => void;
  onLinkBibliography?: (selection: SelectionDraft) => void;
  onOpenCitationResolution?: (
    entryId: string,
    resolutionId: string,
    bibliographyComponentIdentity: string,
  ) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const {
    citationResolutions = [],
    componentIdentity,
    plainText,
    sourceId,
    stateId,
  } = reading;
  const { tools: restingTools, showTools: showRestingTools = true } =
    resting ?? {};
  const q = useAnnotationQueries({ sourceId, stateId });
  const openCitationResolution = citationResolutionOpener(
    onOpenCitationResolution,
  );
  const selection = useAnnotationSelection({
    articleRef,
    annotations: q.annotations,
    citationResolutions,
    componentIdentity,
    sourceId,
    stateId,
    plainText,
    onOpenCitationResolution: openCitationResolution,
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
  const selectedForBibliography = state.selection;
  const hasUnsavedChanges = hasUnsavedAnnotationChanges(state);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
    return () => onUnsavedChange?.(false);
  }, [hasUnsavedChanges, onUnsavedChange]);

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
    onLinkBibliography: bibliographyLinkAction(
      onLinkBibliography,
      selectedForBibliography,
      dispatch,
    ),
    plainText,
    queries: q,
    restingTools,
    showRestingTools,
    selection,
  };

  return annotationView(view, state);
}

function citationResolutionOpener(
  open:
    | ((
        entryId: string,
        resolutionId: string,
        bibliographyComponentIdentity: string,
      ) => void)
    | undefined,
) {
  if (!open) return undefined;
  return (resolution: CitationResolution) =>
    open(
      resolution.bibliographyEntryId,
      resolution.id,
      resolution.bibliographyComponentIdentity,
    );
}

function bibliographyLinkAction(
  link: ((selection: SelectionDraft) => void) | undefined,
  selected: SelectionDraft | undefined,
  dispatch: ReturnType<typeof useAnnotationSelection>["dispatch"],
) {
  if (!link || !selected) return undefined;
  return () => {
    link(selected);
    dispatch({ type: "CLOSE_MENU" });
  };
}

function annotationView(
  view: Parameters<typeof AnnotationPanelView>[0]["view"],
  state: ReturnType<typeof useAnnotationSelection>["state"],
) {
  if (state.panelOpen) return <AnnotationPanelView view={view} />;
  if (!state.selection || !state.position) {
    return <AnnotationRestingView view={view} />;
  }
  return <AnnotationSelectionView view={view} />;
}

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
