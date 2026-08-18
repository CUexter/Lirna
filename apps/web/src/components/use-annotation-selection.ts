import { type RefObject, useEffect, useReducer, useRef } from "react";

import type {
  Annotation,
  AnnotationColor,
  MenuPosition,
  SelectionDraft,
} from "./annotation-dom-utils";
import {
  menuPosition,
  rangeOffsets,
  selectionInside,
  textOffsetAtPoint,
} from "./annotation-dom-utils";

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
        selection: undefined,
        editing: undefined,
        position: undefined,
      };
    case "CLOSE_MENU":
      return {
        ...state,
        selection: undefined,
        editing: undefined,
        position: undefined,
      };
    case "OPEN_PANEL":
      return { ...state, panelOpen: true, position: undefined };
    case "CLOSE_PANEL":
      return {
        ...state,
        panelOpen: false,
        selection: undefined,
        editing: undefined,
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

export function useAnnotationSelection(
  articleRef: RefObject<HTMLElement | null>,
  annotations: Annotation[],
  componentIdentity: string,
): UseAnnotationSelectionResult {
  const [state, dispatch] = useReducer(
    annotationSelectionReducer,
    initialState,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
      const offsets = rangeOffsets(article, selectedRange);
      dispatch({
        type: "DRAFT",
        selection: { ...offsets, exactText },
        position: menuPosition(selectedRange.getBoundingClientRect()),
      });
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, [articleRef]);

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
      const annotation = annotations.find(
        (candidate) =>
          candidate.componentIdentity === componentIdentity &&
          candidate.startOffset <= offset &&
          offset < candidate.endOffset,
      );
      if (!annotation) return;
      dispatch({ type: "EDIT", annotation });
    };
    article.addEventListener("pointerup", openExisting);
    return () => article.removeEventListener("pointerup", openExisting);
  }, [annotations, articleRef, componentIdentity]);

  return { state, dispatch, menuRef, panelRef };
}
