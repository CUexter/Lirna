import type { CitationResolution } from "../annotations/dom-utils";
import type { SepReadingData } from "./content";

type Component = SepReadingData["components"][number];
type Inlines = Component["sections"][number]["title"];

export type BibliographyMention =
  | {
      origin: "authored";
      id: string;
      context: string;
      componentIdentity: string;
    }
  | {
      origin: "manual-resolution";
      id: string;
      context: string;
      componentIdentity: string;
      resolution: CitationResolution;
    };

export function indexBibliographyMentions(
  components: SepReadingData["components"],
  mainComponentIdentity: string,
  citationResolutions: CitationResolution[],
) {
  const mentions = new Map<string, BibliographyMention[]>();
  const add = (entryKey: string, mention: BibliographyMention) =>
    mentions.set(entryKey, [...(mentions.get(entryKey) ?? []), mention]);

  for (const component of components) {
    const visit = (values: Inlines, context = inlineText(values)) => {
      for (const value of values) {
        if (value.kind === "citation" && value.entryId) {
          const bibliographyComponent = bibliographyComponentFor(
            components,
            component,
            value.entryId,
            mainComponentIdentity,
          );
          if (!bibliographyComponent) continue;
          add(`${bibliographyComponent.identity}:${value.entryId}`, {
            origin: "authored",
            id: value.mentionId,
            context,
            componentIdentity: component.identity,
          });
        } else if ("children" in value) {
          visit(value.children, context);
        }
      }
    };
    visitBlocks(component.introductoryBlocks, visit);
    visitSections(component.sections, visit);
  }

  for (const resolution of citationResolutions) {
    add(
      `${resolution.bibliographyComponentIdentity}:${resolution.bibliographyEntryId}`,
      {
        origin: "manual-resolution",
        id: resolution.id,
        context: normalizeContext(
          `${resolution.prefix}${resolution.exactText}${resolution.suffix}`,
        ),
        componentIdentity: resolution.componentIdentity,
        resolution,
      },
    );
  }
  return mentions;
}

function bibliographyComponentFor(
  components: SepReadingData["components"],
  citingComponent: Component,
  entryId: string,
  mainComponentIdentity: string,
) {
  if (
    citingComponent.bibliography.some((group) =>
      group.entries.some((entry) => entry.id === entryId),
    )
  ) {
    return citingComponent;
  }
  return components.find(
    (component) => component.identity === mainComponentIdentity,
  );
}

function visitSections(
  sections: Component["sections"],
  visit: (values: Inlines) => void,
) {
  for (const section of sections) {
    visit(section.title);
    visitBlocks(section.blocks, visit);
    visitSections(section.children, visit);
  }
}

function visitBlocks(
  blocks: Component["introductoryBlocks"],
  visit: (values: Inlines) => void,
) {
  for (const block of blocks) {
    if (block.kind === "statement") {
      visit(block.label);
      visit(block.body);
    } else if (block.kind === "list") {
      for (const item of block.items) visit(item);
    } else if (block.kind === "table") {
      visit(block.caption);
      visitTableRows([...block.head, ...block.body], visit);
    } else if (block.kind === "figure") {
      visit(block.figure.caption);
      visit(block.figure.description.text);
    } else if (block.kind !== "diagnostic") {
      visit(block.children);
    }
  }
}

function visitTableRows(
  rows: Array<{ cells: Inlines[] }>,
  visit: (values: Inlines) => void,
) {
  for (const row of rows) for (const cell of row.cells) visit(cell);
}

function inlineText(values: Inlines): string {
  return normalizeContext(
    values
      .map((value) => {
        if (value.kind === "text") return value.text;
        if (value.kind === "tex") return value.source;
        if (value.kind === "citation") return value.label;
        return inlineText(value.children);
      })
      .join(""),
  );
}

function normalizeContext(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
