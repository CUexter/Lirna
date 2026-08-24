// biome-ignore lint/style/noExcessiveLinesPerFile: Bibliography extraction and citation resolution share one deterministic matching pipeline.
import {
  authorYearKey,
  authorYearReferences,
  indexAuthorYearCandidates,
} from "./sep-citation-author-year";
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

  const elements = descendants(container);
  const titleHeading = elements.find(isHeading);
  const groups: ReadingBibliographyGroup[] = [];
  let entryIndex = 0;
  let groupIndex = 0;
  let group: ReadingBibliographyGroup = {
    id: elementId(container) ?? "bibliography",
    title: bibliographyTitle(container),
    entries: [],
    provenance: {
      componentIdentity,
      locator: `#${elementId(container) ?? "bibliography"}`,
    },
  };
  for (const element of elements) {
    if (element !== titleHeading && isHeading(element)) {
      if (group.entries.length) groups.push(group);
      groupIndex += 1;
      const id = elementId(element) ?? `bibliography-group-${groupIndex}`;
      group = {
        id,
        title: textContent(element),
        entries: [],
        provenance: { componentIdentity, locator: `#${id}` },
      };
    } else if (isBibliographyEntry(element)) {
      group.entries.push(
        bibliographyEntry(element, entryIndex, componentIdentity),
      );
      entryIndex += 1;
    }
  }
  if (group.entries.length) groups.push(group);
  return {
    groups,
    excludedElements: new Set([container]),
  };
}

export function resolveSepCitations(
  introductoryBlocks: ReadingBlock[],
  sections: ReadingSection[],
  groups: ReadingBibliographyGroup[],
  urls: { current: string; bibliography: string },
) {
  const context: CitationResolutionContext = {
    entries: groups.flatMap((group) => group.entries),
    authorYearCandidates: indexAuthorYearCandidates(groups),
    mention: 0,
    urls,
  };
  const resolve = (inline: ReadingInline) => resolveCitation(inline, context);
  transformBlocks(introductoryBlocks, resolve);
  transformSections(sections, resolve);
}

type BibliographyEntry = ReadingBibliographyGroup["entries"][number];
interface CitationResolutionContext {
  entries: BibliographyEntry[];
  authorYearCandidates: ReturnType<typeof indexAuthorYearCandidates>;
  mention: number;
  urls: { current: string; bibliography: string };
}

function resolveCitation(
  inline: ReadingInline,
  context: CitationResolutionContext,
): ReadingInline[] {
  if (inline.kind === "link") return [resolveCitationLink(inline, context)];
  if (inline.kind === "text") return resolveCitationText(inline, context);
  if ("children" in inline)
    return [
      {
        ...inline,
        children: inline.children.flatMap((child) =>
          resolveCitation(child, context),
        ),
      },
    ];
  return [inline];
}

const maxCitationCandidates = 12;

function resolveCitationText(
  inline: Extract<ReadingInline, { kind: "text" }>,
  context: CitationResolutionContext,
): ReadingInline[] {
  const resolved: ReadingInline[] = [];
  let offset = 0;
  for (const reference of authorYearReferences(inline.text)) {
    if (reference.start < offset) continue;
    const candidates =
      context.authorYearCandidates.get(
        authorYearKey(reference.surname, reference.year),
      ) ?? [];
    if (!candidates.length) continue;
    if (reference.start > offset)
      resolved.push({
        kind: "text",
        text: inline.text.slice(offset, reference.start),
      });
    const label = inline.text.slice(reference.start, reference.end);
    context.mention += 1;
    const state = citationState(candidates);
    resolved.push({
      kind: "citation",
      mentionId: `citation-mention-${context.mention}`,
      label,
      state,
      candidates: candidates
        .slice(0, maxCitationCandidates)
        .map((entry) => entry.id),
      rule: "authored-author-year",
      evidence: label,
      ...(state === "resolved" ? { entryId: candidates[0]?.id } : {}),
    });
    offset = reference.end;
  }
  if (offset === 0) return [inline];
  if (offset < inline.text.length)
    resolved.push({ kind: "text", text: inline.text.slice(offset) });
  return resolved;
}

function resolveCitationLink(
  inline: Extract<ReadingInline, { kind: "link" }>,
  context: CitationResolutionContext,
): ReadingInline {
  const label = inlineText(inline.children);
  const target = linkFragment(inline.href, context.urls);
  const byTarget = target
    ? context.entries.filter((entry) => entry.anchor === target)
    : [];
  if (inline.internal && !inline.href.startsWith("#") && !byTarget.length)
    return {
      ...inline,
      children: inline.children.flatMap((child) =>
        resolveCitation(child, context),
      ),
    };
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
    candidates: candidates
      .slice(0, maxCitationCandidates)
      .map((entry) => entry.id),
    rule: byTarget.length
      ? "authored-fragment-target"
      : "normalized-authored-label",
    evidence: byTarget.length ? inline.href : label,
    ...(state === "resolved" ? { entryId: candidates[0]?.id } : {}),
  };
}

function linkFragment(href: string, urls: CitationResolutionContext["urls"]) {
  try {
    const target = new URL(href, urls.current);
    const bibliography = new URL(urls.bibliography);
    if (
      target.origin !== bibliography.origin ||
      normalizedDocumentPath(target.pathname) !==
        normalizedDocumentPath(bibliography.pathname) ||
      target.search !== bibliography.search
    )
      return undefined;
    return target.hash.slice(1) || undefined;
  } catch {
    return undefined;
  }
}

function normalizedDocumentPath(pathname: string) {
  return pathname.replace(/\/index\.html$/i, "/");
}

function citationState(candidates: BibliographyEntry[]) {
  if (candidates.length === 1) return "resolved" as const;
  if (candidates.length > 1) return "ambiguous" as const;
  return "unresolved" as const;
}

function transformSections(
  sections: ReadingSection[],
  resolve: (inline: ReadingInline) => ReadingInline[],
) {
  for (const section of sections) {
    section.title = section.title.flatMap(resolve);
    transformBlocks(section.blocks, resolve);
    transformSections(section.children, resolve);
  }
}
function transformBlocks(
  blocks: ReadingBlock[],
  resolve: (inline: ReadingInline) => ReadingInline[],
) {
  for (const block of blocks) {
    if (block.kind === "statement") {
      block.label = block.label.flatMap(resolve);
      block.body = block.body.flatMap(resolve);
    } else if (block.kind === "list")
      block.items = block.items.map((item) => item.flatMap(resolve));
    else if (block.kind === "table") {
      block.caption = block.caption.flatMap(resolve);
      for (const row of [...block.head, ...block.body])
        row.cells = row.cells.map((cell) => cell.flatMap(resolve));
    } else if (block.kind === "figure") {
      block.figure.caption = block.figure.caption.flatMap(resolve);
      block.figure.description.text =
        block.figure.description.text.flatMap(resolve);
    } else if (block.kind !== "diagnostic")
      block.children = block.children.flatMap(resolve);
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
function isHeading(element: HtmlElement) {
  return /^h[2-6]$/.test(element.tagName);
}
function bibliographyTitle(container: HtmlElement) {
  const heading = descendants(container).find(isHeading);
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
