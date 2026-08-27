import type {
  ReadingBlock,
  ReadingDiagnostic,
  ReadingFigure,
} from "./sep-reading-contract";
import {
  childElements,
  descendants,
  type HtmlElement,
  hasClass,
} from "./sep-reading-dom";
import {
  diagnostic,
  type InlineContext,
  inlineNodes,
} from "./sep-reading-inline";

export type BlockContext = InlineContext & {
  blocks: ReadingBlock[];
  figures: Map<HtmlElement, ReadingFigure>;
  numbering: { count: number };
};

export function appendBlock(element: HtmlElement, context: BlockContext) {
  const figure = context.figures.get(element);
  if (figure) {
    context.blocks.push({ kind: "figure", figure });
    return;
  }
  if (element.tagName === "p") {
    appendInlineBlock(element, context, "paragraph");
    return;
  }
  if (element.tagName === "blockquote") {
    appendInlineBlock(element, context, "quotation");
    return;
  }
  if (element.tagName === "ul" || element.tagName === "ol") {
    appendList(element, context);
    return;
  }
  if (element.tagName === "table") {
    appendTable(element, context);
    return;
  }
  if (element.tagName === "dl") {
    appendDefinitionList(element, context);
    return;
  }
  if (element.tagName === "div" && hasClass(element, "statement")) {
    appendStatementDiv(element, context);
    return;
  }
  if (["div", "figure", "pre", "aside"].includes(element.tagName)) {
    appendUnsupported(element, context);
  }
}

export function attachAnchor(block: ReadingBlock, id: string) {
  const anchor = { kind: "anchor" as const, id, children: [] };
  if (block.kind === "figure") {
    block.figure.id = id;
  } else if (block.kind === "statement") {
    block.label.unshift(anchor);
  } else if (block.kind === "list") {
    block.items[0]?.unshift(anchor);
  } else if (block.kind === "table") {
    (block.caption.length
      ? block.caption
      : (block.head[0]?.cells[0] ?? block.body[0]?.cells[0])
    )?.unshift(anchor);
  } else if (block.kind !== "diagnostic") {
    block.children.unshift(anchor);
  }
}

function appendInlineBlock(
  element: HtmlElement,
  context: BlockContext,
  kind: "paragraph" | "quotation",
) {
  const children = inlineNodes(element, context);
  if (children.length) context.blocks.push({ kind, children });
}

function appendList(element: HtmlElement, context: BlockContext) {
  const items = childElements(element)
    .filter((child) => child.tagName === "li")
    .map((item) => inlineNodes(item, context))
    .filter((item) => item.length > 0);
  if (items.length)
    context.blocks.push({
      kind: "list",
      ordered: element.tagName === "ol",
      items,
    });
}

function appendDefinitionList(element: HtmlElement, context: BlockContext) {
  const terms = childElements(element);
  for (let index = 0; index < terms.length; index += 2) {
    const label = terms[index];
    const body = terms[index + 1];
    if (label?.tagName === "dt" && body?.tagName === "dd")
      context.blocks.push({
        kind: "statement",
        label: inlineNodes(label, context),
        body: inlineNodes(body, context),
      });
  }
}

function appendStatementDiv(element: HtmlElement, context: BlockContext) {
  const label = childElements(element).find((child) =>
    hasClass(child, "label"),
  );
  const body = element.childNodes
    .filter((child) => child !== label)
    .flatMap((child) => inlineNodes(child, context));
  const labelNodes = label ? inlineNodes(label, context) : [];
  if (labelNodes.length && body.length)
    context.blocks.push({ kind: "statement", label: labelNodes, body });
}

function appendUnsupported(element: HtmlElement, context: BlockContext) {
  addDiagnostic(
    context,
    element,
    "unsupported-structure",
    `The authored ${element.tagName} structure could not be rendered without changing its meaning.`,
  );
}

function appendTable(table: HtmlElement, context: BlockContext) {
  const rows = descendants(table).filter((element) => element.tagName === "tr");
  const isGenuine =
    rows.some((row) =>
      childElements(row).some((cell) => cell.tagName === "th"),
    ) || childElements(table).some((child) => child.tagName === "caption");
  const cells = rows.map((row) => ({
    cells: childElements(row)
      .filter((cell) => cell.tagName === "td" || cell.tagName === "th")
      .map((cell) => {
        const children = inlineNodes(cell, context);
        if (!hasClass(cell, "numbered")) return children;
        context.numbering.count += 1;
        return children.length
          ? children
          : [{ kind: "text" as const, text: `(${context.numbering.count})` }];
      }),
  }));
  if (!isGenuine) {
    for (const row of cells) {
      const children = row.cells.flatMap((cell, index) =>
        index === 0 ? cell : [{ kind: "text" as const, text: " " }, ...cell],
      );
      if (children.length) context.blocks.push({ kind: "paragraph", children });
    }
    return;
  }
  const caption = childElements(table).find(
    (child) => child.tagName === "caption",
  );
  const headerCount = rows.filter((row) =>
    childElements(row).some((cell) => cell.tagName === "th"),
  ).length;
  context.blocks.push({
    kind: "table",
    caption: caption ? inlineNodes(caption, context) : [],
    head: cells.slice(0, headerCount),
    body: cells.slice(headerCount),
  });
}

function addDiagnostic(
  context: BlockContext,
  element: HtmlElement,
  code: string,
  message: string,
) {
  const value: ReadingDiagnostic = diagnostic(
    context.componentIdentity,
    element,
    code,
    message,
  );
  context.diagnostics.push(value);
  context.blocks.push({ kind: "diagnostic", diagnostic: value });
}
