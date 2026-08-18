import type { AppRouter } from "@lirna/api/client";
import { Button } from "@lirna/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lirna/ui/components/popover";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { PaletteIcon, StickyNoteIcon } from "lucide-react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { queryClient, trpc } from "@/utils/trpc";
import { AnnotationColorPicker } from "./annotation-color-picker";
import { AnnotationNoteForm } from "./annotation-note-form";
import { AnnotationSidePanel } from "./annotation-side-panel";

type Annotation = inferRouterOutputs<AppRouter>["annotations"]["list"][number];
type AnnotationColor = Annotation["color"];

const colors: AnnotationColor[] = ["yellow", "green", "blue", "pink"];
const highlightNames = colors.map((color) => `lirna-annotation-${color}`);
const highlightStyles = colors
  .map(
    (color) =>
      `::highlight(lirna-annotation-${color}) { background-color: var(--annotation-${color}); }`,
  )
  .join("\n");
const draftHighlightName = "lirna-annotation-draft";
const draftHighlightStyle = (color: AnnotationColor) =>
  `::highlight(${draftHighlightName}) { background-color: var(--annotation-${color}); }`;

interface SelectionDraft {
  startOffset: number;
  endOffset: number;
  exactText: string;
}

interface MenuPosition {
  left: number;
  top: number;
  below: boolean;
}

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
    const registry = customHighlightRegistry();
    const HighlightConstructor = customHighlightConstructor();
    if (!registry || !HighlightConstructor) return;
    const range = rangeFromOffsets(
      article,
      selection.startOffset,
      selection.endOffset,
    );
    if (!range || range.toString() !== selection.exactText) return;
    registry.set(draftHighlightName, new HighlightConstructor(range));
    return () => {
      registry.delete(draftHighlightName);
    };
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

  const styleContent = `${highlightStyles}\n${draftHighlightStyle(color)}`;
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

  const menuStyle = {
    left: position.left,
    top: position.top,
    transform: position.below ? "translateX(-50%)" : "translate(-50%, -100%)",
  } satisfies CSSProperties;

  return (
    <>
      <style>{styleContent}</style>
      <div
        aria-label="Create annotation"
        className="fixed flex items-center gap-1 border bg-popover p-1 text-popover-foreground shadow-lg"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeMenu();
        }}
        onPointerDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest("button")
          ) {
            event.preventDefault();
          }
        }}
        ref={menuRef}
        role="dialog"
        style={menuStyle}
      >
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger
            aria-label="Quick highlight"
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <PaletteIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-1.5">
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Color</legend>
              {colors.map((value) => (
                <Button
                  aria-label={`${value} highlight`}
                  className="rounded-full border-foreground/20"
                  key={value}
                  onClick={() => quickHighlight(value)}
                  onMouseDown={(event) => event.preventDefault()}
                  size="icon-sm"
                  style={{ backgroundColor: `var(--annotation-${value})` }}
                  type="button"
                  variant="outline"
                />
              ))}
            </fieldset>
          </PopoverContent>
        </Popover>
        <Button
          aria-label="Add note"
          onClick={openPanel}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <StickyNoteIcon />
        </Button>
      </div>
    </>
  );
}

function selectionInside(article: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  return article.contains(range.startContainer) &&
    article.contains(range.endContainer)
    ? range
    : undefined;
}

function rangeOffsets(article: HTMLElement, range: Range) {
  const prefix = document.createRange();
  prefix.selectNodeContents(article);
  prefix.setEnd(range.startContainer, range.startOffset);
  const startOffset = prefix.toString().length;
  return { startOffset, endOffset: startOffset + range.toString().length };
}

function rangeFromOffsets(
  article: HTMLElement,
  startOffset: number,
  endOffset: number,
) {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let start: { node: Node; offset: number } | undefined;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!start && startOffset <= offset + length) {
      start = { node, offset: startOffset - offset };
    }
    if (start && endOffset <= offset + length) {
      range.setStart(start.node, start.offset);
      range.setEnd(node, endOffset - offset);
      return range;
    }
    offset += length;
    node = walker.nextNode();
  }
  return undefined;
}

function paintAnnotations(article: HTMLElement, annotations: Annotation[]) {
  const registry = customHighlightRegistry();
  const HighlightConstructor = customHighlightConstructor();
  if (!registry || !HighlightConstructor) return undefined;
  for (const name of highlightNames) registry.delete(name);
  for (const color of colors) {
    const ranges = annotations.flatMap((annotation) => {
      if (annotation.color !== color) return [];
      const range = rangeFromOffsets(
        article,
        annotation.startOffset,
        annotation.endOffset,
      );
      return range?.toString() === annotation.exactText ? [range] : [];
    });
    if (ranges.length) {
      registry.set(
        `lirna-annotation-${color}`,
        new HighlightConstructor(...ranges),
      );
    }
  }
  return () => {
    for (const name of highlightNames) registry.delete(name);
  };
}

function customHighlightRegistry() {
  return (
    CSS as typeof CSS & {
      highlights?: {
        set(name: string, value: unknown): void;
        delete(name: string): void;
      };
    }
  ).highlights;
}

function customHighlightConstructor() {
  return (
    window as typeof window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }
  ).Highlight;
}

function textOffsetAtPoint(article: HTMLElement, x: number, y: number) {
  const modern = (
    document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => {
        offsetNode: Node;
        offset: number;
      } | null;
    }
  ).caretPositionFromPoint?.(x, y);
  const legacy = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint?.(x, y);
  const node = modern?.offsetNode ?? legacy?.startContainer;
  const offset = modern?.offset ?? legacy?.startOffset;
  if (!node || offset === undefined || !article.contains(node)) return -1;
  const prefix = document.createRange();
  prefix.selectNodeContents(article);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

function menuPosition(rect: DOMRect): MenuPosition {
  const halfWidth = 176;
  return {
    left: Math.min(
      window.innerWidth - halfWidth,
      Math.max(halfWidth, rect.left + rect.width / 2),
    ),
    top: rect.top < 220 ? rect.bottom + 8 : rect.top - 8,
    below: rect.top < 220,
  };
}
