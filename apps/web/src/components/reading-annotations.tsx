import type { AppRouter } from "@lirna/api/client";
import { Button } from "@lirna/ui/components/button";
import { Textarea } from "@lirna/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckIcon, Trash2Icon } from "lucide-react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { queryClient, trpc } from "@/utils/trpc";

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
  const [selection, setSelection] = useState<SelectionDraft>();
  const [editing, setEditing] = useState<Annotation>();
  const [position, setPosition] = useState<MenuPosition>();
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [body, setBody] = useState("");

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
    closeMenu();
    void refresh();
  }

  function closeMenu() {
    setSelection(undefined);
    setEditing(undefined);
    setPosition(undefined);
    window.getSelection()?.removeAllRanges();
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
    const handleSelection = () => {
      if (menuRef.current?.contains(document.activeElement)) return;
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
      setPosition(
        menuPosition({
          left: event.clientX,
          right: event.clientX,
          top: event.clientY,
          bottom: event.clientY,
          width: 0,
          height: 0,
          x: event.clientX,
          y: event.clientY,
          toJSON: () => ({}),
        }),
      );
    };
    article.addEventListener("pointerup", openExisting);
    return () => article.removeEventListener("pointerup", openExisting);
  }, [annotations, articleRef, componentIdentity]);

  const active = selection ?? editing;
  if (!active || !position) return <style>{highlightStyles}</style>;
  const pending =
    createAnnotation.isPending ||
    updateAnnotation.isPending ||
    deleteAnnotation.isPending;
  const error =
    createAnnotation.error ?? updateAnnotation.error ?? deleteAnnotation.error;
  const menuStyle = {
    left: position.left,
    top: position.top,
    transform: position.below ? "translateX(-50%)" : "translate(-50%, -100%)",
  } satisfies CSSProperties;

  return (
    <>
      <style>{highlightStyles}</style>
      <div
        aria-label={editing ? "Edit annotation" : "Create annotation"}
        className="fixed flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 border bg-popover p-3 text-popover-foreground shadow-lg"
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
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Color</legend>
          {colors.map((value) => (
            <Button
              aria-label={`${value} highlight`}
              aria-pressed={color === value}
              className="rounded-full border-foreground/20"
              key={value}
              onClick={() => setColor(value)}
              size="icon-sm"
              style={{ backgroundColor: `var(--annotation-${value})` }}
              type="button"
              variant="outline"
            >
              {color === value ? <CheckIcon /> : null}
            </Button>
          ))}
          {editing ? (
            <Button
              aria-label="Delete annotation"
              className="ml-auto"
              disabled={pending}
              onClick={() =>
                deleteAnnotation.mutate({ ...input, id: editing.id })
              }
              size="icon-sm"
              type="button"
              variant="destructive"
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </fieldset>
        <Textarea
          aria-label="Annotation note"
          maxLength={20_000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a note (optional)"
          value={body}
        />
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={closeMenu} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
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
            }}
            size="sm"
            type="button"
          >
            {editing ? "Save" : "Highlight"}
          </Button>
        </div>
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
