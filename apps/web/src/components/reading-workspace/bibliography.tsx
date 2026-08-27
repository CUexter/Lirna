import { Button } from "@lirna/ui/components/button";
import { Input } from "@lirna/ui/components/input";
import { LocateFixedIcon } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import type { CitationResolution } from "../annotations/dom-utils";
import {
  type BibliographyMention,
  indexBibliographyMentions,
} from "./bibliography-mentions";
import { useBibliographySelection } from "./bibliography-navigation";
import { CitationResolutionPanel } from "./citation-resolution-panel";
import type { ReadingDerivative } from "./content";
import type { ReadingNavigation } from "./reading-navigation";

// fallow-ignore-next-line complexity
export function Bibliography({
  bibliographyComponents,
  selection: {
    componentIdentity: selectedComponentIdentity,
    entry: selectedEntry,
    request: citationScrollRequest,
  },
  scrollContainerRef,
  onReturn,
  resolution,
  navigation,
  compact = false,
}: {
  bibliographyComponents: {
    all: ReadingDerivative["components"];
    citationResolutions: CitationResolution[];
    mainIdentity: string;
  };
  selection: {
    componentIdentity: string;
    entry?: string;
    request: number;
  };
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onReturn: (mention: BibliographyMention) => void;
  resolution?: React.ComponentProps<typeof CitationResolutionPanel>;
  navigation: ReadingNavigation;
  compact?: boolean;
}) {
  const {
    all: components,
    citationResolutions,
    mainIdentity: mainComponentIdentity,
  } = bibliographyComponents;
  const [query, setQuery] = useState("");
  const selectedEntryRef = useRef<HTMLLIElement>(null);
  const selectedEntryKey = selectedEntry
    ? `${selectedComponentIdentity}:${selectedEntry}`
    : undefined;
  const selectedEntryRequest = selectedEntryKey
    ? `${selectedEntryKey}:${citationScrollRequest}`
    : undefined;
  const mentions = indexBibliographyMentions(
    components,
    mainComponentIdentity,
    citationResolutions,
  );
  const groups = groupBibliographyByAuthor(
    components,
    query,
    selectedComponentIdentity,
    selectedEntry,
  );
  useBibliographySelection({
    navigation,
    scrollContainerRef,
    selectedComponentIdentity,
    selectedEntry,
    selectedEntryRef,
    selectedEntryRequest,
  });
  return (
    <section
      aria-label={compact ? "Bibliography" : undefined}
      aria-labelledby={compact ? undefined : "bibliography-heading"}
      className={`flex flex-col ${compact ? "gap-3" : "gap-6"}`}
    >
      <header className={compact ? "border-b pb-3" : "border-b pb-6"}>
        {compact ? null : (
          <>
            <p className="font-sans text-muted-foreground text-sm">
              Reading tools
            </p>
            <h2 className="font-serif text-3xl" id="bibliography-heading">
              Bibliography
            </h2>
          </>
        )}
        <label
          className="mt-4 block font-sans text-sm"
          htmlFor="bibliography-search"
        >
          Search bibliography
        </label>
        <Input
          className="mt-1 w-full rounded border bg-background p-2 font-sans"
          id="bibliography-search"
          onChange={(event) => setQuery(event.target.value)}
          value={query}
        />
        {resolution ? (
          <CitationResolutionPanel
            key={resolution.evidence.id}
            {...resolution}
          />
        ) : null}
      </header>
      {groups.length ? (
        <nav aria-label="Bibliography by author">
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.key}>
                <details
                  className="group rounded border"
                  open={
                    Boolean(query) ||
                    Boolean(resolution) ||
                    group.entries.some((entry) => entry.selected)
                  }
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-sans font-semibold text-sm [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="text-primary transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {group.author}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {group.entries.length}
                    </span>
                  </summary>
                  <ol className="flex list-none flex-col gap-4 border-t p-3">
                    {group.entries.map((entry) => (
                      <li
                        className={
                          entry.selected
                            ? "rounded border border-primary p-3"
                            : "p-3"
                        }
                        id={entry.key}
                        key={entry.key}
                        ref={entry.selected ? selectedEntryRef : undefined}
                        tabIndex={entry.selected ? -1 : undefined}
                      >
                        <p>{entry.text}</p>
                        <p className="mt-1 font-sans text-muted-foreground text-xs">
                          {entry.component.label}
                        </p>
                        {entry.links.map((link) => (
                          <a
                            className="mr-3 font-sans text-sm underline"
                            href={link.href}
                            key={link.href}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {link.label} (online only)
                          </a>
                        ))}
                        {mentions.get(entry.key)?.map((mention) => (
                          <details
                            className="mt-4 rounded-md border bg-muted/40 p-3"
                            key={mention.id}
                          >
                            <summary className="cursor-pointer font-medium font-sans text-muted-foreground text-xs uppercase tracking-wide">
                              Citation context
                            </summary>
                            <blockquote className="mt-2 border-l-2 pl-3 font-serif text-sm leading-6">
                              {mention.context}
                            </blockquote>
                            <Button
                              className="mt-3"
                              onClick={() => onReturn(mention)}
                              type="button"
                              variant="outline"
                            >
                              <LocateFixedIcon data-icon="inline-start" />
                              Show in article
                            </Button>
                          </details>
                        ))}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p className="font-sans text-muted-foreground text-sm">
          No bibliography entries match this search.
        </p>
      )}
    </section>
  );
}

function groupBibliographyByAuthor(
  components: ReadingDerivative["components"],
  query: string,
  selectedComponentIdentity: string,
  selectedEntry: string | undefined,
) {
  const inheritedAuthors = new Map<string, string>();
  const groups = new Map<string, BibliographyGroup>();
  const normalizedQuery = normalize(query);
  for (const component of components) {
    for (const bibliography of component.bibliography) {
      addBibliographyEntries(bibliography, component, {
        groups,
        inheritedAuthors,
        normalizedQuery,
        selectedComponentIdentity,
        selectedEntry,
      });
    }
  }
  return [...groups.values()].toSorted((left, right) =>
    left.author.localeCompare(right.author, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

type BibliographyGroup = {
  key: string;
  author: string;
  entries: Array<{
    key: string;
    id: string;
    text: string;
    links: ReadingDerivative["components"][number]["bibliography"][number]["entries"][number]["links"];
    component: ReadingDerivative["components"][number];
    selected: boolean;
  }>;
};

function addBibliographyEntries(
  bibliography: ReadingDerivative["components"][number]["bibliography"][number],
  component: ReadingDerivative["components"][number],
  context: {
    groups: Map<string, BibliographyGroup>;
    inheritedAuthors: Map<string, string>;
    normalizedQuery: string;
    selectedComponentIdentity: string;
    selectedEntry: string | undefined;
  },
) {
  const inheritanceKey = `${component.identity}:${bibliography.id}`;
  let inheritedAuthor = context.inheritedAuthors.get(inheritanceKey);
  for (const entry of bibliography.entries) {
    const repeatedAuthor = /^\s*(?:-{2,}|–+|—+)/u.test(entry.text);
    const explicitAuthor = repeatedAuthor
      ? undefined
      : bibliographyAuthor(entry.text);
    if (explicitAuthor) {
      inheritedAuthor = explicitAuthor;
      context.inheritedAuthors.set(inheritanceKey, explicitAuthor);
    }
    const author = explicitAuthor ?? inheritedAuthor ?? "Other";
    if (
      context.normalizedQuery &&
      !normalize(`${author} ${entry.text}`).includes(context.normalizedQuery)
    )
      continue;
    const key = normalize(author);
    const group = context.groups.get(key) ?? { key, author, entries: [] };
    group.entries.push({
      key: `${component.identity}:${entry.id}`,
      id: entry.id,
      text: entry.text,
      links: entry.links,
      component,
      selected:
        component.identity === context.selectedComponentIdentity &&
        entry.id === context.selectedEntry,
    });
    context.groups.set(key, group);
  }
}

function bibliographyAuthor(text: string) {
  const year = text.match(/\b(?:1[5-9]\d{2}|20\d{2})[a-z]?\b/i);
  if (year?.index === undefined) return undefined;
  return (
    text
      .slice(0, year.index)
      .replace(/[,\s]+$/g, "")
      .trim() || undefined
  );
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
