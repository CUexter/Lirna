import type { ReadingBlock, ReadingSection } from "./sep-reading-contract";
import { inlineText } from "./sep-reading-inline";

export function readingArticleText(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
) {
  return [...blocksText(introductoryBlocks), ...sectionsText(sections)].join(
    "\n\n",
  );
}

function blocksText(blocks: ReadingBlock[]): string[] {
  return blocks.map((block) =>
    block.kind === "statement"
      ? `${inlineText(block.label)} ${inlineText(block.body)}`
      : block.kind === "list"
        ? block.items.map(inlineText).join(" ")
        : block.kind === "table"
          ? block.body.flatMap((row) => row.cells.map(inlineText)).join(" ")
          : block.kind === "figure"
            ? `${inlineText(block.figure.caption)} ${inlineText(block.figure.description.text)}`.trim()
            : block.kind === "diagnostic"
              ? block.diagnostic.message
              : inlineText(block.children),
  );
}

function sectionsText(sections: ReadingSection[]): string[] {
  return sections.flatMap((section) => [
    inlineText(section.title),
    ...blocksText(section.blocks),
    ...sectionsText(section.children),
  ]);
}
