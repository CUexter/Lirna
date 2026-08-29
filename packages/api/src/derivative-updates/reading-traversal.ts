import { readingBlockInlineGroups } from "../sep-admission/reading/content";
import type {
  ReadingBlock,
  ReadingInline,
  ReadingSection,
  SepReadingContract,
} from "../sep-admission/reading/contract";

export function visitReading(
  reading: SepReadingContract,
  visit: (inline: ReadingInline, componentIdentity: string) => void,
) {
  for (const component of reading.components) {
    visitBlocks(component.introductoryBlocks, component.identity, visit);
    visitSections(component.sections, (section) => {
      visitInlines(section.title, component.identity, visit);
      visitBlocks(section.blocks, component.identity, visit);
    });
  }
}

export function visitSections(
  sections: ReadingSection[],
  visit: (section: ReadingSection) => void,
) {
  for (const section of sections) {
    visit(section);
    visitSections(section.children, visit);
  }
}

function visitBlocks(
  blocks: ReadingBlock[],
  componentIdentity: string,
  visit: (inline: ReadingInline, componentIdentity: string) => void,
) {
  for (const block of blocks)
    for (const inlines of readingBlockInlineGroups(block))
      visitInlines(inlines, componentIdentity, visit);
}

function visitInlines(
  inlines: ReadingInline[],
  componentIdentity: string,
  visit: (inline: ReadingInline, componentIdentity: string) => void,
) {
  for (const inline of inlines) {
    visit(inline, componentIdentity);
    if ("children" in inline)
      visitInlines(inline.children, componentIdentity, visit);
  }
}

export function componentHasTarget(
  component: SepReadingContract["components"][number],
  target: string,
) {
  let found = false;
  const inspect = (inline: ReadingInline) => {
    if (inline.kind === "anchor" && inline.id === target) found = true;
  };
  visitBlocks(component.introductoryBlocks, component.identity, inspect);
  visitSections(component.sections, (section) => {
    if (section.id === target) found = true;
    visitInlines(section.title, component.identity, inspect);
    visitBlocks(section.blocks, component.identity, inspect);
  });
  return found;
}
