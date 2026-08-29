import {
  readingBlockInlineGroups,
  readingInlineText,
} from "@lirna/api/client/reading-content";
import { Button } from "@lirna/ui/components/button";
import { LocateFixedIcon } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";

import type { ReadingDerivative } from "./content";
import { readingSceneOwnerFor } from "./reading-scene-topology";

type Component = ReadingDerivative["components"][number];
type Block = Component["introductoryBlocks"][number];
type Inline = Component["sections"][number]["title"][number];

export interface ReadingReference {
  componentIdentity: string;
  context: string;
  jumpLabel?: string;
  label: string;
  targetId: string;
  title: string;
}

export interface ReferenceIndex {
  byBlock: Map<Block, ReadingReference>;
  byLabel: Map<string, ReadingReference>;
  byTargetId: Map<string, ReadingReference>;
  componentIdentity: string;
}

export const ReferenceActions = createContext<{
  index: ReferenceIndex;
  jump: (reference: ReadingReference) => void;
  open: (reference: ReadingReference) => void;
} | null>(null);

export function createReferenceIndex(component: Component): ReferenceIndex {
  const byBlock = new Map<Block, ReadingReference>();
  const byLabel = new Map<string, ReadingReference>();
  const byTargetId = new Map<string, ReadingReference>();
  const indexBlocks = (blocks: Block[]) => {
    for (const block of blocks) {
      const context = blockText(block);
      const label = numberedBlockLabel(block);
      if (label && !byLabel.has(label)) {
        const reference = {
          componentIdentity: component.identity,
          context,
          label,
          targetId: `reading-reference-number-${label.slice(1, -1)}`,
          title: `Numbered statement ${label}`,
        };
        byBlock.set(block, reference);
        byLabel.set(label, reference);
        byTargetId.set(reference.targetId, reference);
      }
      for (const targetId of blockAnchorIds(block)) {
        if (byTargetId.has(targetId)) continue;
        byTargetId.set(targetId, {
          componentIdentity: component.identity,
          context,
          label: targetId,
          targetId,
          title: "Referenced passage",
        });
      }
    }
  };
  const indexSections = (
    sections: Component["sections"],
    parentNumber: number[] = [],
  ) => {
    sections.forEach((section, index) => {
      const sectionNumber = [...parentNumber, index + 1];
      const label = `§${sectionNumber.join(".")}`;
      const reference = {
        componentIdentity: component.identity,
        context: section.blocks.map(blockText).filter(Boolean).join(" "),
        label,
        targetId: section.id,
        title: readingInlineText(section.title),
      };
      byLabel.set(label, reference);
      byTargetId.set(section.id, reference);
      indexBlocks(section.blocks);
      indexSections(section.children, sectionNumber);
    });
  };

  indexBlocks(component.introductoryBlocks);
  indexSections(component.sections);
  return {
    byBlock,
    byLabel,
    byTargetId,
    componentIdentity: component.identity,
  };
}

export function referenceTarget(reference: ReadingReference) {
  return `reference:${reference.componentIdentity}:${reference.targetId}`;
}

export function referenceForAuthoredLink(
  currentIndex: ReferenceIndex,
  target: { component: Component; fragment?: string },
  label: string,
) {
  const { component: targetComponent, fragment: targetId } = target;
  if (!targetId) return undefined;
  const normalizedLabel = label.replace(/\s+/g, "");
  if (/^\(\d+\)$/.test(normalizedLabel))
    return currentIndex.byLabel.get(normalizedLabel);
  if (/^§\d+(?:\.\d+){0,2}$/.test(normalizedLabel)) return undefined;
  if (readingSceneOwnerFor(targetComponent) === "publisher-note") {
    const reference =
      createReferenceIndex(targetComponent).byTargetId.get(targetId);
    return reference
      ? {
          ...reference,
          jumpLabel: "Show in publisher notes",
          label,
          title: "Publisher footnote",
        }
      : undefined;
  }
  if (
    targetComponent.identity !== currentIndex.componentIdentity ||
    targetId !== label
  )
    return undefined;
  return currentIndex.byTargetId.get(targetId);
}

export function AutoReferencedText({ text }: { text: string }) {
  const actions = useContext(ReferenceActions);
  if (!actions) return text;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(/§\s*\d+(?:\.\d+){0,2}|\(\d+\)/g)) {
    const index = match.index;
    const label = match[0];
    const reference = actions.index.byLabel.get(label.replace(/\s+/g, ""));
    if (!reference) continue;
    parts.push(text.slice(offset, index));
    parts.push(
      <Button
        aria-label={`Reference ${label}`}
        className="h-auto p-0 font-serif text-lg"
        key={`${index}:${label}`}
        onClick={() =>
          label.startsWith("§")
            ? actions.jump(reference)
            : actions.open(reference)
        }
        type="button"
        variant="link"
      >
        {label}
      </Button>,
    );
    offset = index + label.length;
  }
  if (offset === 0) return text;
  parts.push(text.slice(offset));
  return parts;
}

export function useReferenceTargetId(block: Block) {
  return useContext(ReferenceActions)?.index.byBlock.get(block)?.targetId;
}

export function ReferencePreview({
  reference,
  onJump,
  compact = false,
}: {
  reference: ReadingReference;
  onJump: () => void;
  compact?: boolean;
}) {
  return (
    <section
      aria-labelledby="reference-heading"
      className={`flex flex-col ${compact ? "gap-4" : "gap-6"}`}
    >
      <header className={`border-b ${compact ? "pb-4" : "pb-6"}`}>
        {compact ? null : (
          <p className="font-sans text-muted-foreground text-sm">
            Reading tools
          </p>
        )}
        <h2
          className={`font-semibold font-serif ${compact ? "text-xl" : "text-2xl"}`}
          id="reference-heading"
        >
          {reference.label}
        </h2>
        <p className="mt-1 text-muted-foreground">{reference.title}</p>
      </header>
      <div className="rounded-md border bg-muted/40 p-4">
        <p className="mb-2 font-medium text-muted-foreground text-sm">
          Reference context
        </p>
        <blockquote
          className={`font-serif ${compact ? "text-base leading-7" : "text-lg leading-8"}`}
        >
          {reference.context || "No preview text is available."}
        </blockquote>
      </div>
      <Button onClick={onJump} type="button" variant="outline">
        <LocateFixedIcon data-icon="inline-start" />
        {reference.jumpLabel ?? "Show in article"}
      </Button>
    </section>
  );
}

function numberedBlockLabel(block: Block) {
  if (block.kind === "paragraph") {
    const first = block.children[0];
    if (first?.kind === "text" && /^\(\d+\)$/.test(first.text))
      return first.text;
  }
  for (const values of readingBlockInlineGroups(block)) {
    const match = /^\((\d+)\)(?:\s|$)/.exec(readingInlineText(values));
    if (match) return `(${match[1]})`;
  }
}

function blockAnchorIds(block: Block) {
  return readingBlockInlineGroups(block).flatMap(inlineAnchorIds);
}

function inlineAnchorIds(values: Inline[]): string[] {
  return values.flatMap((value) => {
    if (value.kind === "anchor") return [value.id];
    if (
      value.kind === "text" ||
      value.kind === "tex" ||
      value.kind === "citation"
    )
      return [];
    return inlineAnchorIds(value.children);
  });
}

function blockText(block: Block) {
  if (block.kind === "paragraph") {
    const [first, ...rest] = block.children;
    if (first?.kind === "text" && /^\(\d+\)$/.test(first.text))
      return `${first.text} ${readingInlineText(rest)}`.trim();
  }
  return readingBlockInlineGroups(block)
    .map(readingInlineText)
    .filter(Boolean)
    .join(" ");
}
