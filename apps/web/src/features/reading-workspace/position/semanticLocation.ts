import type { InquiryOutputs } from "@/clients/inquiry";

export type ReadingSemanticLocation = NonNullable<
  NonNullable<InquiryOutputs["sources"]["resume"]["get"]>["semanticLocation"]
>;

const blockSelector = "h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside";

export function createReadingSemanticLocation({
  componentIdentity,
  owner,
  root,
  scrollTop,
  sourceId,
  stateId,
  viewportHeight,
  viewportTop = 0,
}: {
  componentIdentity: string;
  owner: "article" | "publisher-note";
  root: HTMLElement | null;
  scrollTop: number;
  sourceId: string;
  stateId: string;
  viewportHeight: number;
  viewportTop?: number;
}): ReadingSemanticLocation {
  const roundedScrollTop = Math.max(0, Math.round(scrollTop));
  const blocks = root ? readingBlocks(root) : [];
  if (!root || blocks.length === 0) {
    return location({
      authoredAnchor: null,
      blockIdentity: `scene:${fingerprint(componentIdentity)}`,
      blockIndex: 0,
      blockTag: "scene",
      componentIdentity,
      owner,
      progress: 0,
      scrollTop: roundedScrollTop,
      sourceId,
      stateId,
      strategy: "scene-fallback",
      textExcerpt: "",
    });
  }

  const readingLine = viewportTop + Math.max(0, viewportHeight) * 0.25;
  const blockIndex = activeBlockIndex(blocks, readingLine);
  const block = blocks[blockIndex] as HTMLElement;
  const authoredAnchor = blockAnchor(block);
  const textExcerpt = normalizedBlockText(block).slice(0, 500);
  const rect = block.getBoundingClientRect();
  const progress =
    rect.height > 0
      ? boundedProgress((readingLine - rect.top) / rect.height)
      : 0;

  return location({
    authoredAnchor,
    blockIdentity: semanticBlockIdentity(blocks, blockIndex),
    blockIndex,
    blockTag: block.tagName.toLowerCase(),
    componentIdentity,
    owner,
    progress,
    scrollTop: roundedScrollTop,
    sourceId,
    stateId,
    strategy: authoredAnchor ? "authored-anchor" : "content-fingerprint",
    textExcerpt,
  });
}

export function resolveReadingSemanticLocation({
  componentIdentity,
  location: semantic,
  owner,
  root,
  scrollTop,
  sourceId,
  stateId,
  viewportHeight,
  viewportTop = 0,
}: {
  componentIdentity: string;
  location?: ReadingSemanticLocation;
  owner: "article" | "publisher-note";
  root: HTMLElement | null;
  scrollTop: number;
  sourceId: string;
  stateId: string;
  viewportHeight: number;
  viewportTop?: number;
}) {
  if (
    !semantic ||
    semantic.source.sourceId !== sourceId ||
    semantic.source.stateId !== stateId ||
    semantic.scene.identity !== componentIdentity ||
    semantic.scene.componentIdentity !== componentIdentity ||
    semantic.scene.owner !== owner
  )
    return undefined;
  if (!root || semantic.block.strategy === "scene-fallback") return undefined;

  const blocks = readingBlocks(root);
  const block = blocks.find(
    (_candidate, index) =>
      semanticBlockIdentity(blocks, index) === semantic.block.identity,
  );
  if (!block) return undefined;

  const rect = block.getBoundingClientRect();
  if (rect.height <= 0) return undefined;
  const readingLine = Math.max(0, viewportHeight) * 0.25;
  return Math.max(
    0,
    Math.round(
      scrollTop +
        rect.top -
        viewportTop +
        semantic.progress * rect.height -
        readingLine,
    ),
  );
}

function semanticBlockIdentity(blocks: HTMLElement[], blockIndex: number) {
  const block = blocks[blockIndex] as HTMLElement;
  const anchor = blockAnchor(block);
  if (anchor) return `anchor:${fingerprint(anchor)}`;
  const contentFingerprint = fingerprint(blockSignature(block));
  const duplicateIndex = blocks
    .slice(0, blockIndex)
    .filter(
      (candidate) =>
        fingerprint(blockSignature(candidate)) === contentFingerprint,
    ).length;
  return `content:${contentFingerprint}:${duplicateIndex}`;
}

function readingBlocks(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(blockSelector)).filter(
    (candidate) => {
      const parentBlock = candidate.parentElement?.closest(blockSelector);
      return !parentBlock || !root.contains(parentBlock);
    },
  );
}

function activeBlockIndex(blocks: HTMLElement[], readingLine: number) {
  const containing = blocks.findIndex((block) => {
    const rect = block.getBoundingClientRect();
    return (
      rect.height > 0 && readingLine >= rect.top && readingLine <= rect.bottom
    );
  });
  if (containing >= 0) return containing;
  const next = blocks.findIndex(
    (block) => block.getBoundingClientRect().top > readingLine,
  );
  return next === 0 ? 0 : next < 0 ? blocks.length - 1 : next - 1;
}

function blockAnchor(block: HTMLElement) {
  const own = block.id.trim();
  if (own) return own;
  return block.querySelector<HTMLElement>("[id]")?.id.trim() || null;
}

function blockSignature(block: HTMLElement) {
  const text = normalizedBlockText(block);
  const media = Array.from(block.querySelectorAll("img"))
    .map(
      (image) =>
        `${image.getAttribute("src") ?? ""}|${image.getAttribute("alt") ?? ""}`,
    )
    .join("|");
  return text || media || block.getAttribute("aria-label") || "empty-block";
}

function normalizedBlockText(block: HTMLElement) {
  return (block.textContent ?? "").replace(/\s+/g, " ").trim();
}

function boundedProgress(progress: number) {
  return Math.round(Math.min(1, Math.max(0, progress)) * 1_000_000) / 1_000_000;
}

function fingerprint(value: string) {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function location(input: {
  authoredAnchor: string | null;
  blockIdentity: string;
  blockIndex: number;
  blockTag: string;
  componentIdentity: string;
  owner: "article" | "publisher-note";
  progress: number;
  scrollTop: number;
  sourceId: string;
  stateId: string;
  strategy: ReadingSemanticLocation["block"]["strategy"];
  textExcerpt: string;
}): ReadingSemanticLocation {
  return {
    version: 1,
    source: { sourceId: input.sourceId, stateId: input.stateId },
    scene: {
      identity: input.componentIdentity,
      componentIdentity: input.componentIdentity,
      owner: input.owner,
    },
    block: { identity: input.blockIdentity, strategy: input.strategy },
    progress: input.progress,
    fallback: {
      scrollTop: input.scrollTop,
      blockIndex: input.blockIndex,
      blockTag: input.blockTag,
      textExcerpt: input.textExcerpt,
      authoredAnchor: input.authoredAnchor,
    },
  };
}
