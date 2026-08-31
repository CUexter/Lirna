import { type ReactNode, type RefObject, useEffect } from "react";
import type {
  Annotation,
  CitationResolution,
  SelectionDraft,
} from "../domUtils";
import { useAnnotationActions } from "../hooks/useActions";
import { useAnnotationDomEffects } from "../hooks/useDomEffects";
import { useAnnotationQueries } from "../hooks/useQueries";
import {
  hasUnsavedAnnotationChanges,
  useAnnotationSelection,
} from "../hooks/useSelection";
import {
  AnnotationPanelView,
  AnnotationRestingView,
  AnnotationSelectionView,
} from "./Views";

export function ReadingAnnotations({
  articleRef,
  navigateToAnnotation,
  reading,
  resting,
  editAnnotationId,
  onEditAnnotationHandled,
  onAskSelection,
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
  onAskSelection?: (selection: SelectionDraft) => void;
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
    onAskSelection,
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
