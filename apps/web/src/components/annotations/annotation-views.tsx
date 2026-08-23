import { Button } from "@lirna/ui/components/button";
import { StickyNoteIcon } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useState } from "react";

import { AnnotationColorPicker } from "./color-picker";
import {
  type Annotation,
  annotationStyleContent,
  calloutPosition,
  colors,
  rangeFromAnchor,
} from "./dom-utils";
import { AnnotationNoteForm } from "./note-form";
import { AnnotationSelectionMenu } from "./selection-menu";
import { AnnotationSidePanel } from "./side-panel";
import type { AnnotationActions } from "./use-annotation-actions";
import type { AnnotationQueries } from "./use-queries";
import type { UseAnnotationSelectionResult } from "./use-selection";

interface AnnotationView {
  actions: AnnotationActions;
  annotations: Annotation[];
  articleRef: RefObject<HTMLElement | null>;
  navigateToAnnotation: (annotation: Annotation) => void;
  notes: Annotation[];
  plainText: string;
  queries: AnnotationQueries;
  restingTools?: ReactNode;
  showRestingTools: boolean;
  selection: UseAnnotationSelectionResult;
}

export function AnnotationPanelView({ view }: { view: AnnotationView }) {
  const { actions, annotations, navigateToAnnotation, queries, selection } =
    view;
  const { dispatch, panelRef, state } = selection;
  return (
    <>
      <style>{annotationStyleContent(state.color)}</style>
      <AnnotationSidePanel
        annotations={annotations}
        editing={!!state.editing}
        key={state.editing?.id ?? (state.selection ? "draft" : "annotations")}
        onClose={actions.closePanel}
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
          onColorChange={actions.setColor}
          onDelete={state.editing ? actions.deleteAnnotation : undefined}
          pending={queries.pending}
        />
        <AnnotationNoteForm
          body={state.body}
          editing={!!state.editing}
          error={queries.error?.message}
          onBodyChange={actions.setBody}
          onClose={actions.closePanel}
          onSave={actions.saveAnnotation}
          pending={queries.pending}
        />
      </AnnotationSidePanel>
    </>
  );
}

export function AnnotationRestingView({ view }: { view: AnnotationView }) {
  const {
    actions,
    articleRef,
    navigateToAnnotation,
    notes,
    plainText,
    queries,
  } = view;
  return (
    <>
      <style>{annotationStyleContent(view.selection.state.color)}</style>
      <AnnotationError error={queries.error} />
      <AnnotationCallouts
        annotations={notes.filter(
          (annotation) => (annotation.body?.length ?? 0) <= 140,
        )}
        articleRef={articleRef}
        onSelect={navigateToAnnotation}
        plainText={plainText}
      />
      {view.showRestingTools ? (
        <nav
          aria-label="Reading tools"
          className="fixed top-20 right-4 z-40 flex items-center gap-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur"
        >
          {view.restingTools}
          <Button
            aria-label="View notes"
            onClick={actions.openPanel}
            type="button"
            variant="secondary"
          >
            <StickyNoteIcon data-icon="inline-start" />
            Notes
            {notes.length > 0 ? ` (${notes.length})` : ""}
          </Button>
        </nav>
      ) : null}
    </>
  );
}

export function AnnotationSelectionView({ view }: { view: AnnotationView }) {
  const { actions, queries, selection } = view;
  const { menuRef, state } = selection;
  if (!state.position) return null;
  return (
    <>
      <style>{annotationStyleContent(state.color)}</style>
      <AnnotationError error={queries.error} />
      <AnnotationSelectionMenu
        colorPicker={{
          colors,
          onOpenChange: actions.setColorPickerOpen,
          onQuickHighlight: actions.quickHighlight,
          open: state.colorPickerOpen,
        }}
        menuRef={menuRef}
        onClose={actions.closeMenu}
        onOpenPanel={actions.openPanel}
        pending={queries.pending}
        position={state.position}
      />
    </>
  );
}

function AnnotationError({ error }: { error: Error | null }) {
  return error ? (
    <p className="text-destructive text-xs" role="alert">
      {error.message}
    </p>
  ) : null;
}

function AnnotationCallouts({
  annotations,
  articleRef,
  plainText,
  onSelect,
}: {
  annotations: Annotation[];
  articleRef: RefObject<HTMLElement | null>;
  plainText: string;
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
          const range = rangeFromAnchor(article, plainText, annotation);
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
  }, [annotations, articleRef, plainText]);

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
