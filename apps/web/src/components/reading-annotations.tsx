import { useMutation, useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";

import { queryClient, trpc } from "@/utils/trpc";
import { AnnotationColorPicker } from "./annotation-color-picker";
import {
  type Annotation,
  type AnnotationColor,
  annotationStyleContent,
  colors,
  type MenuPosition,
  menuPosition,
  paintAnnotations,
  paintDraftSelection,
  rangeOffsets,
  type SelectionDraft,
  selectionInside,
  textOffsetAtPoint,
} from "./annotation-dom-utils";
import { AnnotationNoteForm } from "./annotation-note-form";
import { AnnotationSelectionMenu } from "./annotation-selection-menu";
import { AnnotationSidePanel } from "./annotation-side-panel";

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
  const input = { sourceId, stateId };
  const annotationsQuery = useQuery(trpc.annotations.list.queryOptions(input));
  const annotations = annotationsQuery.data ?? [];
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionDraft>();
  const [editing, setEditing] = useState<Annotation>();
  const [position, setPosition] = useState<MenuPosition>();
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [body, setBody] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.annotations.list.queryOptions(input).queryKey,
    });
  const createAnnotation = useMutation({
    ...trpc.annotations.create.mutationOptions(),
    onSuccess: closeAndRefresh,
  });
  const updateAnnotation = useMutation({
    ...trpc.annotations.update.mutationOptions(),
    onSuccess: closeAndRefresh,
  });
  const deleteAnnotation = useMutation({
    ...trpc.annotations.delete.mutationOptions(),
    onSuccess: closeAndRefresh,
  });

  function closeAndRefresh() {
    closePanel();
    void refresh();
  }

  function closeMenu() {
    setSelection(undefined);
    setEditing(undefined);
    setPosition(undefined);
    window.getSelection()?.removeAllRanges();
  }

  function closePanel() {
    setPanelOpen(false);
    closeMenu();
  }

  function openPanel() {
    setPanelOpen(true);
    setPosition(undefined);
  }

  function quickHighlight(value: AnnotationColor) {
    if (!selection) return;
    setColorPickerOpen(false);
    createAnnotation.mutate({
      ...input,
      componentIdentity,
      ...selection,
      color: value,
      body: "",
    });
  }

  function saveAnnotation() {
    if (editing) {
      updateAnnotation.mutate({
        ...input,
        id: editing.id,
        color,
        body,
      });
      return;
    }
    if (!selection) return;
    createAnnotation.mutate({
      ...input,
      componentIdentity,
      ...selection,
      color,
      body,
    });
  }

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    return paintAnnotations(
      article,
      annotations.filter(
        (annotation) => annotation.componentIdentity === componentIdentity,
      ),
    );
  }, [annotations, articleRef, componentIdentity]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !selection) return;
    return paintDraftSelection(article, selection);
  }, [selection, articleRef]);

  useEffect(() => {
    const handleSelection = () => {
      if (menuRef.current?.contains(document.activeElement)) return;
      if (panelRef.current?.contains(document.activeElement)) return;
      const article = articleRef.current;
      const selectedRange = article ? selectionInside(article) : undefined;
      const exactText = selectedRange?.toString() ?? "";
      if (!article || !selectedRange || !exactText.trim()) {
        setSelection(undefined);
        setEditing(undefined);
        setPosition(undefined);
        return;
      }
      const offsets = rangeOffsets(article, selectedRange);
      setEditing(undefined);
      setSelection({ ...offsets, exactText });
      setColor("yellow");
      setBody("");
      setPosition(menuPosition(selectedRange.getBoundingClientRect()));
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, [articleRef]);

  useEffect(() => {
    if (!position) return;
    const detach = (event: Event) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setSelection(undefined);
      setEditing(undefined);
      setPosition(undefined);
    };
    window.addEventListener("scroll", detach, true);
    window.addEventListener("resize", detach);
    return () => {
      window.removeEventListener("scroll", detach, true);
      window.removeEventListener("resize", detach);
    };
  }, [position]);

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
      setSelection(undefined);
      setEditing(annotation);
      setColor(annotation.color);
      setBody(annotation.body ?? "");
      setPosition(undefined);
      setPanelOpen(true);
    };
    article.addEventListener("pointerup", openExisting);
    return () => article.removeEventListener("pointerup", openExisting);
  }, [annotations, articleRef, componentIdentity]);

  const styleContent = annotationStyleContent(color);
  const pending =
    createAnnotation.isPending ||
    updateAnnotation.isPending ||
    deleteAnnotation.isPending;
  const error =
    createAnnotation.error ?? updateAnnotation.error ?? deleteAnnotation.error;

  if (panelOpen) {
    return (
      <>
        <style>{styleContent}</style>
        <AnnotationSidePanel
          editing={!!editing}
          onClose={closePanel}
          panelRef={panelRef}
        >
          <AnnotationColorPicker
            color={color}
            colors={colors}
            editing={!!editing}
            onColorChange={setColor}
            onDelete={
              editing
                ? () => deleteAnnotation.mutate({ ...input, id: editing.id })
                : undefined
            }
            pending={pending}
          />
          <AnnotationNoteForm
            body={body}
            editing={!!editing}
            error={error?.message}
            onBodyChange={setBody}
            onClose={closePanel}
            onSave={saveAnnotation}
            pending={pending}
          />
        </AnnotationSidePanel>
      </>
    );
  }

  if (!selection || !position) {
    return <style>{styleContent}</style>;
  }

  return (
    <>
      <style>{styleContent}</style>
      <AnnotationSelectionMenu
        colorPickerOpen={colorPickerOpen}
        colors={colors}
        menuRef={menuRef}
        onClose={closeMenu}
        onColorPickerOpenChange={setColorPickerOpen}
        onOpenPanel={openPanel}
        onQuickHighlight={quickHighlight}
        position={position}
      />
    </>
  );
}
