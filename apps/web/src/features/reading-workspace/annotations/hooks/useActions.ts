import type { Dispatch } from "react";

import type { AnnotationColor } from "../domUtils";
import type { AnnotationQueries } from "./useQueries";
import type {
  AnnotationSelectionAction,
  AnnotationSelectionState,
} from "./useSelection";

export function useAnnotationActions({
  componentIdentity,
  dispatch,
  queries,
  state,
}: {
  componentIdentity: string;
  dispatch: Dispatch<AnnotationSelectionAction>;
  queries: AnnotationQueries;
  state: AnnotationSelectionState;
}) {
  const handleSuccess = () => {
    dispatch({ type: "SUCCESS" });
    queries.refresh();
  };
  const closeSelection = (type: "CLOSE_MENU" | "CLOSE_PANEL") => {
    dispatch({ type });
    window.getSelection()?.removeAllRanges();
  };
  const quickHighlight = (color: AnnotationColor) => {
    if (!state.selection) return;
    dispatch({ type: "TOGGLE_COLOR_PICKER", open: false });
    queries.create.mutate(
      {
        ...queries.input,
        componentIdentity,
        ...state.selection,
        kind: "highlight",
        color,
        body: "",
      },
      { onSuccess: handleSuccess },
    );
  };
  const saveAnnotation = () => {
    if (state.editing) {
      queries.update.mutate(
        {
          id: state.editing.id,
          color: state.color,
          kind: state.body.trim() ? "note" : "highlight",
          body: state.body,
        },
        { onSuccess: handleSuccess },
      );
      return;
    }
    if (!state.selection) return;
    queries.create.mutate(
      {
        ...queries.input,
        componentIdentity,
        ...state.selection,
        kind: state.body.trim() ? "note" : "highlight",
        color: state.color,
        body: state.body,
      },
      { onSuccess: handleSuccess },
    );
  };
  const deleteAnnotation = () => {
    if (!state.editing || !window.confirm("Delete this annotation?")) return;
    queries.remove.mutate(
      { id: state.editing.id },
      { onSuccess: handleSuccess },
    );
  };

  return {
    closeMenu: () => closeSelection("CLOSE_MENU"),
    closePanel: () => closeSelection("CLOSE_PANEL"),
    deleteAnnotation,
    openPanel: () => dispatch({ type: "OPEN_PANEL" }),
    quickHighlight,
    saveAnnotation,
    setBody: (body: string) => dispatch({ type: "SET_BODY", body }),
    setColor: (color: AnnotationColor) =>
      dispatch({ type: "SET_COLOR", color }),
    setColorPickerOpen: (open: boolean) =>
      dispatch({ type: "TOGGLE_COLOR_PICKER", open }),
  };
}

export type AnnotationActions = ReturnType<typeof useAnnotationActions>;
