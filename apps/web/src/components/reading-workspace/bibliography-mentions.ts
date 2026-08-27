import {
  readingInlineText,
  visitReadingInlineGroups,
} from "@lirna/api/client/reading-content";
import type { CitationResolution } from "../annotations/dom-utils";
import type { ReadingDerivative } from "./content";

type Component = ReadingDerivative["components"][number];
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
  components: ReadingDerivative["components"],
  mainComponentIdentity: string,
  citationResolutions: CitationResolution[],
) {
  const mentions = new Map<string, BibliographyMention[]>();
  const add = (entryKey: string, mention: BibliographyMention) =>
    mentions.set(entryKey, [...(mentions.get(entryKey) ?? []), mention]);

  for (const component of components) {
    const visit = (values: Inlines, context = readingInlineText(values)) => {
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
    visitReadingInlineGroups(
      component.introductoryBlocks,
      component.sections,
      visit,
    );
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
  components: ReadingDerivative["components"],
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

function normalizeContext(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
