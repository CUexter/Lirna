import type { ReadingBibliographyGroup } from "../contract";
import {
  attribute,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
  textContent,
} from "../dom";

export { resolveSepCitations } from "./resolution";

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
