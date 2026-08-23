// biome-ignore lint/style/noExcessiveLinesPerFile: Block traversal keeps authored order, shared numbering, diagnostics, and anchor placement in one extraction pipeline.
import type {
  ReadingBlock,
  ReadingDiagnostic,
  ReadingFigure,
  ReadingSection,
} from "./sep-reading-contract";
import {
  childElements,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
  hasClass,
  isStandaloneAnchor,
  nestedAnchorId,
  textContent,
} from "./sep-reading-dom";
import {
  diagnostic,
  type InlineContext,
  inlineNodes,
} from "./sep-reading-inline";
import {
  extractToc,
  normalizeHeading,
  sectionIds,
  validateTocTargets,
} from "./sep-reading-toc";

type BlockContext = InlineContext & {
  blocks: ReadingBlock[];
  figures: Map<HtmlElement, ReadingFigure>;
  numbering: { count: number };
};

export function extractArticle(
  root: HtmlNode | undefined,
  componentIdentity: string,
  ids: Set<string>,
  options: {
    excludedElements?: Set<HtmlElement>;
    figures?: Map<HtmlElement, ReadingFigure>;
  } = {},
) {
  const excludedElements = options.excludedElements ?? new Set<HtmlElement>();
  const figures = options.figures ?? new Map<HtmlElement, ReadingFigure>();
  const introductoryBlocks: ReadingBlock[] = [];
  const sections: ReadingSection[] = [];
  const diagnostics: ReadingDiagnostic[] = [];
  const context: InlineContext = { componentIdentity, ids, diagnostics };
  const stack: ReadingSection[] = [];
  const numbering = { count: 0 };
  let pendingAnchor: string | undefined;
  let generatedSectionCount = 0;
  const visitHeading = (element: HtmlElement) => {
    const title = inlineNodes(element, context);
    if (title.length === 0) return;
    const level = Number(element.tagName.slice(1));
    while ((stack.at(-1)?.level ?? 0) >= level) stack.pop();
    generatedSectionCount += 1;
    const section = {
      id:
        elementId(element) ??
        nestedAnchorId(element) ??
        pendingAnchor ??
        `section-${generatedSectionCount}`,
      title,
      level,
      blocks: [],
      children: [],
    } satisfies ReadingSection;
    pendingAnchor = undefined;
    const parent = stack.at(-1);
    if (parent) parent.children.push(section);
    else sections.push(section);
    stack.push(section);
  };
  const visit = (element: HtmlElement) => {
    if (excludedElements.has(element)) return;
    if (isStandaloneAnchor(element)) {
      pendingAnchor = elementId(element);
      return;
    }
    if (/^h[2-6]$/.test(element.tagName)) {
      visitHeading(element);
      return;
    }
    const target = stack.at(-1)?.blocks ?? introductoryBlocks;
    if (figures.has(element)) {
      const start = target.length;
      appendBlock(element, { ...context, blocks: target, figures, numbering });
      if (pendingAnchor && target.length > start) {
        attachAnchor(target[start] as ReadingBlock, pendingAnchor);
        pendingAnchor = undefined;
      }
      return;
    }
    if (
      ["html", "body", "article", "section", "div"].includes(element.tagName)
    ) {
      for (const child of childElements(element)) visit(child);
      return;
    }
    const start = target.length;
    appendBlock(element, { ...context, blocks: target, figures, numbering });
    if (pendingAnchor && target.length > start) {
      attachAnchor(target[start] as ReadingBlock, pendingAnchor);
      pendingAnchor = undefined;
    }
  };
  for (const element of childElements(root)) {
    visit(element);
  }
  const toc = extractToc(root, sections);
  validateTocTargets(toc, new Set([...ids, ...sectionIds(sections)]), context);
  return {
    toc,
    introductoryBlocks,
    sections,
    diagnostics,
  };
}

export function readingArticleExclusions(root: HtmlNode | undefined) {
  const excludedElements = new Set<HtmlElement>();
  const toc = descendants(root).find(
    (element) => elementId(element) === "toc" || hasClass(element, "toc"),
  );
  if (toc) excludedElements.add(toc);

  const mainText = descendants(root).find(
    (element) => elementId(element) === "main-text",
  );
  const articleContainer = mainText
    ? [...(root && "tagName" in root ? [root] : []), ...descendants(root)].find(
        (element) => childElements(element).includes(mainText),
      )
    : undefined;
  const children = childElements(articleContainer ?? mainText ?? root);
  const cutoff = children.findIndex(isReadingUtilityBoundary);
  if (cutoff >= 0) {
    for (const child of children.slice(cutoff)) excludedElements.add(child);
  }
  return excludedElements;
}

function isReadingUtilityBoundary(element: HtmlElement) {
  if (elementId(element) === "main-text") return false;
  if (
    ["academic-tools", "other-internet-resources", "related-entries"].includes(
      elementId(element) ?? "",
    )
  )
    return true;
  if (isReadingUtilityHeading(element)) return true;
  return descendants(element).some(
    (child) =>
      ["Aca", "Oth", "Rel"].includes(elementId(child) ?? "") ||
      isReadingUtilityHeading(child),
  );
}

function isReadingUtilityHeading(element: HtmlElement) {
  return (
    /^h[2-6]$/.test(element.tagName) &&
    ["academic tools", "other internet resources", "related entries"].includes(
      normalizeHeading(textContent(element)),
    )
  );
}

function appendBlock(element: HtmlElement, context: BlockContext) {
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
    context.blocks.push({
      kind: "statement",
      label: labelNodes,
      body,
    });
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

function attachAnchor(block: ReadingBlock, id: string) {
  const anchor = { kind: "anchor" as const, id, children: [] };
  if (block.kind === "figure") {
    block.figure.id = id;
  } else if (block.kind === "statement") {
    block.label.unshift(anchor);
  } else if (block.kind === "list") {
    block.items[0]?.unshift(anchor);
  } else if (block.kind === "table") {
    (block.caption.length ? block.caption : block.body[0]?.cells[0])?.unshift(
      anchor,
    );
  } else if (block.kind !== "diagnostic") {
    block.children.unshift(anchor);
  }
}

function addDiagnostic(
  context: BlockContext,
  element: HtmlElement,
  code: string,
  message: string,
) {
  const value = diagnostic(context.componentIdentity, element, code, message);
  context.diagnostics.push(value);
  context.blocks.push({ kind: "diagnostic", diagnostic: value });
}
