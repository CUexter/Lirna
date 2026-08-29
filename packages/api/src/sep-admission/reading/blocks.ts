import { appendBlock, attachAnchor } from "./block-parsers";
import type {
  ReadingBlock,
  ReadingDiagnostic,
  ReadingFigure,
  ReadingSection,
} from "./contract";
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
} from "./dom";
import { type InlineContext, inlineNodes } from "./inline";
import {
  extractToc,
  normalizeHeading,
  sectionIds,
  validateTocTargets,
} from "./toc";

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
    const appendTargetBlock = () => {
      const start = target.length;
      appendBlock(element, { ...context, blocks: target, figures, numbering });
      if (pendingAnchor && target.length > start) {
        attachAnchor(target[start] as ReadingBlock, pendingAnchor);
        pendingAnchor = undefined;
      }
    };
    if (figures.has(element)) {
      appendTargetBlock();
      return;
    }
    if (
      ["html", "body", "article", "section", "div"].includes(element.tagName)
    ) {
      for (const child of childElements(element)) visit(child);
      return;
    }
    appendTargetBlock();
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
