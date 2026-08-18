import type { RefObject } from "react";
import { AnnotationColorPicker } from "./annotation-color-picker";
import {
  type AnnotationColor,
  annotationStyleContent,
  colors,
} from "./annotation-dom-utils";
import { AnnotationNoteForm } from "./annotation-note-form";
import { AnnotationSelectionMenu } from "./annotation-selection-menu";
import { AnnotationSidePanel } from "./annotation-side-panel";
import { useAnnotationDomEffects } from "./use-annotation-dom-effects";
import { useAnnotationQueries } from "./use-annotation-queries";
import { useAnnotationSelection } from "./use-annotation-selection";

export function ReadingAnnotations({
  articleRef,
  sourceId,
  stateId,
  componentIdentity,
}: {
  articleRef: RefObject<HTMLElement | null>;
  sourceId: string;
  stateId: string;
  componentIdentity: string;
}) {
  const q = useAnnotationQueries({ sourceId, stateId });
  const { state, dispatch, menuRef, panelRef } = useAnnotationSelection(
    articleRef,
    q.annotations,
    componentIdentity,
  );
  useAnnotationDomEffects(
    articleRef,
    q.annotations,
    state.selection,
    componentIdentity,
  );

  const handleSuccess = () => {
    dispatch({ type: "SUCCESS" });
    q.refresh();
  };

  const closeMenu = () => {
    dispatch({ type: "CLOSE_MENU" });
    window.getSelection()?.removeAllRanges();
  };
  const closePanel = () => {
    dispatch({ type: "CLOSE_PANEL" });
    window.getSelection()?.removeAllRanges();
  };
  const openPanel = () => dispatch({ type: "OPEN_PANEL" });

  const setColor = (color: AnnotationColor) =>
    dispatch({ type: "SET_COLOR", color });
  const setBody = (body: string) => dispatch({ type: "SET_BODY", body });
  const setColorPickerOpen = (open: boolean) =>
    dispatch({ type: "TOGGLE_COLOR_PICKER", open });

  const quickHighlight = (value: AnnotationColor) => {
    if (!state.selection) return;
    setColorPickerOpen(false);
    q.create.mutate(
      {
        ...q.input,
        componentIdentity,
        ...state.selection,
        color: value,
        body: "",
      },
      { onSuccess: handleSuccess },
    );
  };

  const saveAnnotation = () => {
    if (state.editing) {
      q.update.mutate(
        {
          ...q.input,
          id: state.editing.id,
          color: state.color,
          body: state.body,
        },
        { onSuccess: handleSuccess },
      );
      return;
    }
    if (!state.selection) return;
    q.create.mutate(
      {
        ...q.input,
        componentIdentity,
        ...state.selection,
        color: state.color,
        body: state.body,
      },
      { onSuccess: handleSuccess },
    );
  };

  const deleteAnnotation = () => {
    if (!state.editing) return;
    q.remove.mutate(
      { ...q.input, id: state.editing.id },
      { onSuccess: handleSuccess },
    );
  };

  const styleContent = annotationStyleContent(state.color);

  if (state.panelOpen) {
    return (
      <>
        <style>{styleContent}</style>
        <AnnotationSidePanel
          editing={!!state.editing}
          onClose={closePanel}
          panelRef={panelRef}
        >
          <AnnotationColorPicker
            color={state.color}
            colors={colors}
            editing={!!state.editing}
            onColorChange={setColor}
            onDelete={state.editing ? deleteAnnotation : undefined}
            pending={q.pending}
          />
          <AnnotationNoteForm
            body={state.body}
            editing={!!state.editing}
            error={q.error?.message}
            onBodyChange={setBody}
            onClose={closePanel}
            onSave={saveAnnotation}
            pending={q.pending}
          />
        </AnnotationSidePanel>
      </>
    );
  }

  if (!state.selection || !state.position) {
    return <style>{styleContent}</style>;
  }

  return (
    <>
      <style>{styleContent}</style>
      <AnnotationSelectionMenu
        colorPickerOpen={state.colorPickerOpen}
        colors={colors}
        menuRef={menuRef}
        onClose={closeMenu}
        onColorPickerOpenChange={setColorPickerOpen}
        onOpenPanel={openPanel}
        onQuickHighlight={quickHighlight}
        position={state.position}
      />
    </>
  );
}
