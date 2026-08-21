import type {
  ReadingBibliographyGroup,
  ReadingBlock,
  ReadingInline,
  ReadingSection,
} from "./sep-reading-contract";
import {
  attribute,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
  textContent,
} from "./sep-reading-dom";

export interface ReadingBibliography {
  groups: ReadingBibliographyGroup[];
  excludedElements: Set<HtmlElement>;
}

export function extractSepBibliography(
  document: HtmlNode,
  componentIdentity: string,
): ReadingBibliography {
  const containers = descendants(document).filter(isBibliographyContainer);
  const container = containers[0];
  if (!container) return { groups: [], excludedElements: new Set() };

  const entries = descendants(container).filter(isBibliographyEntry);
  const group = {
    id: elementId(container) ?? "bibliography",
    title: bibliographyTitle(container),
    entries: entries.map((entry, index) =>
      bibliographyEntry(entry, index, componentIdentity),
    ),
    provenance: {
      componentIdentity,
      locator: `#${elementId(container) ?? "bibliography"}`,
    },
  } satisfies ReadingBibliographyGroup;
  return {
    groups: group.entries.length ? [group] : [],
    excludedElements: new Set([container]),
  };
}

export function resolveSepCitations(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
  groups: ReadingBibliographyGroup[],
) {
  const context: CitationResolutionContext = {
    entries: groups.flatMap((group) => group.entries),
    mention: 0,
  };
  const resolve = (inline: ReadingInline) => resolveCitation(inline, context);
  transformBlocks(introductoryBlocks, resolve);
  transformSections(sections, resolve);
}

type BibliographyEntry = ReadingBibliographyGroup["entries"][number];
interface CitationResolutionContext {
  entries: BibliographyEntry[];
  mention: number;
}

function resolveCitation(
  inline: ReadingInline,
  context: CitationResolutionContext,
): ReadingInline {
  if (inline.kind === "link") return resolveCitationLink(inline, context);
  if ("children" in inline)
    return {
      ...inline,
      children: inline.children.map((child) => resolveCitation(child, context)),
    };
  return inline;
}

function resolveCitationLink(
  inline: Extract<ReadingInline, { kind: "link" }>,
  context: CitationResolutionContext,
): ReadingInline {
  const label = inlineText(inline.children);
  const target = inline.internal ? inline.href.slice(1) : undefined;
  const byTarget = target
    ? context.entries.filter((entry) => entry.anchor === target)
    : [];
  const normalized = normalize(label);
  const byLabel = normalized
    ? context.entries.filter((entry) => normalize(entry.label) === normalized)
    : [];
  const candidates = byTarget.length ? byTarget : byLabel;
  if (!candidates.length && !citationLike(label)) return inline;

  context.mention += 1;
  const state = citationState(candidates);
  return {
    kind: "citation",
    mentionId: `citation-mention-${context.mention}`,
    label,
    state,
    candidates: candidates.map((entry) => entry.id),
    rule: byTarget.length
      ? "authored-fragment-target"
      : "normalized-authored-label",
    evidence: byTarget.length ? inline.href : label,
    ...(state === "resolved" ? { entryId: candidates[0]?.id } : {}),
  };
}

function citationState(candidates: BibliographyEntry[]) {
  if (candidates.length === 1) return "resolved" as const;
  if (candidates.length > 1) return "ambiguous" as const;
  return "unresolved" as const;
}

function transformSections(
  sections: ReadingSection[],
  resolve: (inline: ReadingInline) => ReadingInline,
) {
  for (const section of sections) {
    section.title = section.title.map(resolve);
    transformBlocks(section.blocks, resolve);
    transformSections(section.children, resolve);
  }
}
function transformBlocks(
  blocks: ReadingBlock[],
  resolve: (inline: ReadingInline) => ReadingInline,
) {
  for (const block of blocks) {
    if (block.kind === "statement") {
      block.label = block.label.map(resolve);
      block.body = block.body.map(resolve);
    } else if (block.kind === "list")
      block.items = block.items.map((item) => item.map(resolve));
    else if (block.kind === "table") {
      block.caption = block.caption.map(resolve);
      for (const row of [...block.head, ...block.body])
        row.cells = row.cells.map((cell) => cell.map(resolve));
    } else if (block.kind === "figure") {
      block.figure.caption = block.figure.caption.map(resolve);
      block.figure.description.text =
        block.figure.description.text.map(resolve);
    } else if (block.kind !== "diagnostic")
      block.children = block.children.map(resolve);
  }
}

function isBibliographyContainer(element: HtmlElement) {
  return /bibliograph|references/i.test(
    `${elementId(element) ?? ""} ${attribute(element, "class") ?? ""}`,
  );
}
function isBibliographyEntry(element: HtmlElement) {
  return (
    element.tagName === "li" ||
    /bib(?:liography)?(?:-|_)?entry|csl-entry/i.test(
      attribute(element, "class") ?? "",
    )
  );
}
function bibliographyTitle(container: HtmlElement) {
  const heading = descendants(container).find((element) =>
    /^h[2-6]$/.test(element.tagName),
  );
  return heading ? textContent(heading) : "Bibliography";
}
function bibliographyEntry(
  element: HtmlElement,
  index: number,
  componentIdentity: string,
) {
  const text = textContent(element);
  const label =
    text.match(/^\s*(\[[^\]]+\]|[^.]{1,120}(?:\d{4}[a-z]?))/)?.[1]?.trim() ||
    text;
  const anchor = elementId(element) ?? `bibliography-entry-${index + 1}`;
  return {
    id: anchor,
    label,
    text,
    anchor,
    links: descendants(element)
      .filter((child) => child.tagName === "a")
      .flatMap((link) => {
        const href = attribute(link, "href");
        return href && /^https?:/i.test(href)
          ? [{ label: textContent(link), href, onlineOnly: true as const }]
          : [];
      }),
    provenance: { componentIdentity, locator: `#${anchor}` },
  };
}
function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
function citationLike(value: string) {
  return /^\s*\[[^\]]+\]\s*$/.test(value) || /\b\d{4}[a-z]?\b/i.test(value);
}
function inlineText(values: ReadingInline[]): string {
  return values
    .map((value) =>
      value.kind === "text"
        ? value.text
        : value.kind === "tex"
          ? value.source
          : value.kind === "citation"
            ? value.label
            : "children" in value
              ? inlineText(value.children)
              : "",
    )
    .join("");
}
