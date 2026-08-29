import type {
  ReadingBlock,
  ReadingComponent,
  ReadingInline,
  ReadingSection,
} from "./contract";

export function readingComponentSummary(component: ReadingComponent) {
  return {
    identity: component.identity,
    role: component.role,
    label: component.label,
    order: component.order,
    ...(component.parentIdentity
      ? { parentIdentity: component.parentIdentity }
      : {}),
    requestedUrl: component.requestedUrl,
    finalUrl: component.finalUrl,
    retrievedAt: component.retrievedAt,
    sha256: component.sha256,
  };
}

export function readingInlineText(values: ReadingInline[]): string {
  return values
    .map((value) => {
      if (value.kind === "text") return value.text;
      if (value.kind === "tex") return value.source;
      if (value.kind === "citation") return value.label;
      return readingInlineText(value.children);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function readingBlockInlineGroups(
  block: ReadingBlock,
): ReadingInline[][] {
  if (block.kind === "paragraph" || block.kind === "quotation")
    return [block.children];
  if (block.kind === "statement") return [block.label, block.body];
  if (block.kind === "list") return block.items;
  if (block.kind === "table")
    return [
      block.caption,
      ...[...block.head, ...block.body].flatMap(({ cells }) => cells),
    ];
  if (block.kind === "figure")
    return [block.figure.caption, block.figure.description.text];
  return [];
}

export function visitReadingInlineGroups(
  blocks: ReadingBlock[],
  sections: ReadingSection[],
  visit: (values: ReadingInline[]) => void,
) {
  for (const block of blocks)
    for (const values of readingBlockInlineGroups(block)) visit(values);
  for (const section of sections) {
    visit(section.title);
    visitReadingInlineGroups(section.blocks, section.children, visit);
  }
}
