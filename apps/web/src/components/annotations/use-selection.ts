import { type RefObject, useEffect, useReducer, useRef } from "react";

import type {
  Annotation,
  AnnotationColor,
  CitationResolution,
  MenuPosition,
  SelectionDraft,
} from "./dom-utils";
import {
  anchorForRange,
  menuPosition,
  rangeFromAnchor,
  rangeOffsets,
  selectionInside,
  textOffsetAtPoint,
} from "./dom-utils";

export interface AnnotationSelectionState {
  selection?: SelectionDraft;
  editing?: Annotation;
  position?: MenuPosition;
  color: AnnotationColor;
  body: string;
  panelOpen: boolean;
  colorPickerOpen: boolean;
}

export type AnnotationSelectionAction =
  | { type: "DRAFT"; selection: SelectionDraft; position: MenuPosition }
  | { type: "REPOSITION"; selection: SelectionDraft; position: MenuPosition }
  | { type: "EDIT"; annotation: Annotation }
  | { type: "DISMISS" }
  | { type: "CLOSE_MENU" }
  | { type: "OPEN_PANEL" }
  | { type: "CLOSE_PANEL" }
  | { type: "SET_COLOR"; color: AnnotationColor }
  | { type: "SET_BODY"; body: string }
  | { type: "TOGGLE_COLOR_PICKER"; open: boolean }
  | { type: "SUCCESS" };

const initialState: AnnotationSelectionState = {
  color: "yellow",
  body: "",
  panelOpen: false,
  colorPickerOpen: false,
};

export function annotationSelectionReducer(
  state: AnnotationSelectionState,
  action: AnnotationSelectionAction,
): AnnotationSelectionState {
  switch (action.type) {
    case "DRAFT":
      return {
        ...state,
        selection: action.selection,
        editing: undefined,
        color: "yellow",
        body: "",
        position: action.position,
        colorPickerOpen: false,
      };
    case "REPOSITION":
      return {
        ...state,
        selection: action.selection,
        position: action.position,
      };
    case "EDIT":
      return {
        ...state,
        selection: undefined,
        editing: action.annotation,
        color: action.annotation.color,
        body: action.annotation.body ?? "",
        position: undefined,
        panelOpen: true,
      };
    case "DISMISS":
      return {
        ...state,
        position: undefined,
      };
    case "CLOSE_MENU":
      return {
        ...state,
        position: undefined,
      };
    case "OPEN_PANEL":
      return { ...state, panelOpen: true, position: undefined };
    case "CLOSE_PANEL":
      return {
        ...state,
        panelOpen: false,
        position: undefined,
      };
    case "SET_COLOR":
      return { ...state, color: action.color };
    case "SET_BODY":
      return { ...state, body: action.body };
    case "TOGGLE_COLOR_PICKER":
      return { ...state, colorPickerOpen: action.open };
    case "SUCCESS":
      return {
        ...state,
        selection: undefined,
        editing: undefined,
        position: undefined,
        colorPickerOpen: false,
        color: "yellow",
        body: "",
        panelOpen: false,
      };
    default:
      return state;
  }
}

export interface UseAnnotationSelectionResult {
  state: AnnotationSelectionState;
  dispatch: React.Dispatch<AnnotationSelectionAction>;
  menuRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
}

export function useAnnotationSelection({
  articleRef,
  annotations,
  citationResolutions = [],
  componentIdentity,
  sourceId,
  stateId,
  plainText,
  onOpenCitationResolution,
}: {
  articleRef: RefObject<HTMLElement | null>;
  annotations: Annotation[];
  citationResolutions?: CitationResolution[];
  componentIdentity: string;
  sourceId: string;
  stateId: string;
  plainText: string;
  onOpenCitationResolution?: (resolution: CitationResolution) => void;
}): UseAnnotationSelectionResult {
  const storageKey = `lirna:annotation-draft:${sourceId}:${stateId}:${componentIdentity}`;
  const [state, dispatch] = useReducer(
    annotationSelectionReducer,
    initialState,
    () => readStoredState(storageKey),
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (state.selection || state.editing) {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [state, storageKey]);

  useEffect(() => {
    const handleSelection = () => {
      if (menuRef.current?.contains(document.activeElement)) return;
      if (panelRef.current?.contains(document.activeElement)) return;
      const article = articleRef.current;
      const selectedRange = article ? selectionInside(article) : undefined;
      const exactText = selectedRange?.toString() ?? "";
      if (!article || !selectedRange || !exactText.trim()) {
        dispatch({ type: "DISMISS" });
        return;
      }
      const selection = anchorForRange(article, selectedRange, plainText);
      if (!selection) return;
      const current = stateRef.current;
      const sameSelection =
        current.selection?.normalizedStartOffset ===
          selection.normalizedStartOffset &&
        current.selection.normalizedEndOffset === selection.normalizedEndOffset;
      if (sameSelection) {
        dispatch({
          type: "REPOSITION",
          selection,
          position: menuPosition(selectedRange.getBoundingClientRect()),
        });
        return;
      }
      dispatch({
        type: "DRAFT",
        selection,
        position: menuPosition(selectedRange.getBoundingClientRect()),
      });
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, [articleRef, plainText]);

  useEffect(() => {
    if (!state.position) return;
    const detach = (event: Event) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      dispatch({ type: "DISMISS" });
    };
    window.addEventListener("scroll", detach, true);
    window.addEventListener("resize", detach);
    return () => {
      window.removeEventListener("scroll", detach, true);
      window.removeEventListener("resize", detach);
    };
  }, [state.position]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const openExisting = (event: PointerEvent) => {
      if (!window.getSelection()?.isCollapsed) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("a,button")
      ) {
        return;
      }
      const offset = textOffsetAtPoint(article, event.clientX, event.clientY);
      const citationResolution = anchoredRecordAt(citationResolutions, {
        article,
        componentIdentity,
        offset,
        plainText,
      });
      if (citationResolution && onOpenCitationResolution) {
        onOpenCitationResolution(citationResolution);
        return;
      }
      const annotation = anchoredRecordAt(annotations, {
        article,
        componentIdentity,
        offset,
        plainText,
      });
      if (!annotation) return;
      dispatch({ type: "EDIT", annotation });
    };
    article.addEventListener("pointerup", openExisting);
    return () => article.removeEventListener("pointerup", openExisting);
  }, [
    annotations,
    articleRef,
    citationResolutions,
    componentIdentity,
    onOpenCitationResolution,
    plainText,
  ]);

  return { state, dispatch, menuRef, panelRef };
}

function anchoredRecordAt<T extends Annotation | CitationResolution>(
  records: T[],
  {
    article,
    componentIdentity,
    offset,
    plainText,
  }: {
    article: HTMLElement;
    componentIdentity: string;
    offset: number;
    plainText: string;
  },
) {
  return records.find((candidate) => {
    if (candidate.componentIdentity !== componentIdentity) return false;
    const range = rangeFromAnchor(article, plainText, candidate);
    if (!range) return false;
    const rendered = rangeOffsets(article, range);
    return rendered.startOffset <= offset && offset < rendered.endOffset;
  });
}

function readStoredState(storageKey: string): AnnotationSelectionState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return initialState;
    return { ...initialState, ...JSON.parse(stored), position: undefined };
  } catch {
    return initialState;
  }
}
