import { Button } from "@lirna/ui/components/button";
import { StickyNoteIcon } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { AnnotationColorPicker } from "./color-picker";
import {
  type Annotation,
  type AnnotationColor,
  annotationStyleContent,
  calloutPosition,
  colors,
  rangeFromOffsets,
} from "./dom-utils";
import { AnnotationNoteForm } from "./note-form";
import { AnnotationSelectionMenu } from "./selection-menu";
import { AnnotationSidePanel } from "./side-panel";
import { useAnnotationDomEffects } from "./use-dom-effects";
import { useAnnotationQueries } from "./use-queries";
import { useAnnotationSelection } from "./use-selection";

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
  const annotations = q.annotations.filter(
    (annotation) => annotation.componentIdentity === componentIdentity,
  );
  const notes = annotations.filter((annotation) =>
    Boolean(annotation.body?.trim()),
  );

  const navigateToAnnotation = (annotation: Annotation) => {
    const article = articleRef.current;
    const range = article
      ? rangeFromOffsets(article, annotation.startOffset, annotation.endOffset)
      : undefined;
    if (!range || range.toString() !== annotation.exactText) return;
    const rect = range.getBoundingClientRect();
    window.scrollBy({
      behavior: "smooth",
      top: rect.top + rect.height / 2 - window.innerHeight / 2,
    });
  };

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
  const error = q.error ? (
    <p className="text-destructive text-xs" role="alert">
      {q.error.message}
    </p>
  ) : null;

  if (state.panelOpen) {
    return (
      <>
        <style>{styleContent}</style>
        <AnnotationSidePanel
          annotations={annotations}
          editing={!!state.editing}
          key={state.editing?.id ?? (state.selection ? "draft" : "annotations")}
          onClose={closePanel}
          onEditAnnotation={(annotation) =>
            dispatch({ type: "EDIT", annotation })
          }
          onSelectAnnotation={navigateToAnnotation}
          panelRef={panelRef}
          showEditor={Boolean(state.editing || state.selection)}
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
    return (
      <>
        <style>{styleContent}</style>
        {error}
        <AnnotationCallouts
          annotations={notes.filter(
            (annotation) => (annotation.body?.length ?? 0) <= 140,
          )}
          articleRef={articleRef}
          onSelect={navigateToAnnotation}
        />
        <Button
          aria-label="View notes"
          className="fixed right-4 bottom-4 z-40 shadow-lg"
          onClick={openPanel}
          type="button"
          variant="secondary"
        >
          <StickyNoteIcon data-icon="inline-start" />
          Notes
          {notes.length > 0 ? ` (${notes.length})` : ""}
        </Button>
      </>
    );
  }

  return (
    <>
      <style>{styleContent}</style>
      {error}
      <AnnotationSelectionMenu
        colorPicker={{
          colors,
          onOpenChange: setColorPickerOpen,
          onQuickHighlight: quickHighlight,
          open: state.colorPickerOpen,
        }}
        menuRef={menuRef}
        onClose={closeMenu}
        onOpenPanel={openPanel}
        pending={q.pending}
        position={state.position}
      />
    </>
  );
}

function AnnotationCallouts({
  annotations,
  articleRef,
  onSelect,
}: {
  annotations: Annotation[];
  articleRef: RefObject<HTMLElement | null>;
  onSelect: (annotation: Annotation) => void;
}) {
  const [positions, setPositions] = useState<
    Array<{
      annotation: Annotation;
      left: number;
      side: "left" | "right";
      top: number;
    }>
  >([]);

  useEffect(() => {
    const update = () => {
      const article = articleRef.current;
      if (!article) return;
      const articleRect = article.getBoundingClientRect();
      setPositions(
        annotations.flatMap((annotation) => {
          const range = rangeFromOffsets(
            article,
            annotation.startOffset,
            annotation.endOffset,
          );
          if (!range || range.toString() !== annotation.exactText) return [];
          const rect = range.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) return [];
          const position = calloutPosition(articleRect, window.innerWidth);
          return position ? [{ annotation, ...position, top: rect.top }] : [];
        }),
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [annotations, articleRef]);

  return positions.map(({ annotation, left, side, top }) => (
    <Button
      className="fixed z-30 h-auto w-56 justify-start whitespace-normal rounded-md border bg-popover p-3 text-left text-popover-foreground text-sm shadow-md transition-colors hover:bg-accent"
      key={annotation.id}
      onClick={() => onSelect(annotation)}
      style={{ left, top: Math.max(12, top) }}
      type="button"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className={`absolute top-3 size-3 rotate-45 bg-popover ${
          side === "right"
            ? "-left-1.5 border-b border-l"
            : "-right-1.5 border-t border-r"
        }`}
      />
      <span className="relative line-clamp-4 whitespace-pre-wrap">
        {annotation.body}
      </span>
    </Button>
  ));
}
