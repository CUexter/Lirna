import type {
  ReadingDiagnostic,
  ReadingSection,
  ReadingTocItem,
} from "./contract";
import {
  attribute,
  childElements,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
  hasClass,
  textContent,
} from "./dom";
import { diagnostic, type InlineContext, inlineText } from "./inline";

export function extractToc(
  root: HtmlNode | undefined,
  sections: ReadingSection[],
): ReadingTocItem[] {
  const toc = descendants(root).find(
    (element) => elementId(element) === "toc" || hasClass(element, "toc"),
  );
  const list =
    toc &&
    descendants(toc).find(
      (element) => element.tagName === "ol" || element.tagName === "ul",
    );
  if (list) return tocItems(list);
  return sections.map(toTocItem);
}

function tocItems(list: HtmlElement): ReadingTocItem[] {
  return childElements(list)
    .filter((item) => item.tagName === "li")
    .flatMap((item) => {
      const link = descendants(item).find(
        (child) =>
          child.tagName === "a" && attribute(child, "href")?.startsWith("#"),
      );
      const nested = childElements(item).find(
        (child) => child.tagName === "ol" || child.tagName === "ul",
      );
      const id = link && attribute(link, "href")?.slice(1);
      const title = link && textContent(link);
      return id && title && !isReadingUtilityTocItem(id, title)
        ? [{ id, title, children: nested ? tocItems(nested) : [] }]
        : [];
    });
}

function isReadingUtilityTocItem(id: string, title: string) {
  return (
    ["Bib", "Aca", "Oth", "Rel"].includes(id) ||
    [
      "bibliography",
      "academic tools",
      "other internet resources",
      "related entries",
    ].includes(normalizeHeading(title))
  );
}

function toTocItem(section: ReadingSection): ReadingTocItem {
  return {
    id: section.id,
    title: inlineText(section.title),
    children: section.children.map(toTocItem),
  };
}

export function sectionIds(sections: ReadingSection[]): string[] {
  return sections.flatMap((section) => [
    section.id,
    ...sectionIds(section.children),
  ]);
}

export function validateTocTargets(
  items: ReadingTocItem[],
  ids: Set<string>,
  context: InlineContext,
) {
  for (const item of items) {
    if (!ids.has(item.id)) {
      context.diagnostics.push({
        level: "warning",
        code: "missing-toc-target",
        message: `The authored table of contents target #${item.id} was not captured.`,
        source: {
          componentIdentity: context.componentIdentity,
          locator: `#${item.id}`,
        },
      });
    }
    validateTocTargets(item.children, ids, context);
  }
}

export function collectTargets(root: HtmlNode, componentIdentity: string) {
  const ids = new Set<string>();
  const diagnostics: ReadingDiagnostic[] = [];
  for (const element of descendants(root)) {
    const id = elementId(element);
    if (!id) continue;
    if (ids.has(id)) {
      diagnostics.push(
        diagnostic(
          componentIdentity,
          element,
          "duplicate-internal-target",
          `The authored internal target #${id} occurs more than once.`,
        ),
      );
    }
    ids.add(id);
  }
  return { ids, diagnostics };
}

export function normalizeHeading(value: string) {
  return value
    .replace(/[\s ]+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
