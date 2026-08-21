import { Button } from "@lirna/ui/components/button";
import { Input } from "@lirna/ui/components/input";
import { useEffect, useRef, useState } from "react";

import type { SepReadingData } from "./content";

export function Bibliography({
  component,
  selectedEntry,
  onReturn,
}: {
  component: SepReadingData["components"][number];
  selectedEntry?: string;
  onReturn: (mentionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedEntryRef = useRef<HTMLLIElement>(null);
  const mentions = citationMentions(component);
  useEffect(() => {
    const entry = selectedEntryRef.current;
    if (!(selectedEntry && entry)) return;
    entry.scrollIntoView?.({ block: "center" });
    entry.focus({ preventScroll: true });
  }, [selectedEntry]);
  return (
    <section
      aria-labelledby="bibliography-heading"
      className="flex flex-col gap-6"
    >
      <header className="border-b pb-6">
        <p className="font-sans text-muted-foreground text-sm">
          Scholarly apparatus
        </p>
        <h2 className="font-serif text-3xl" id="bibliography-heading">
          Bibliography
        </h2>
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
      </header>
      {component.bibliography.map((group) => (
        <section key={group.id}>
          <h3 className="font-serif text-2xl">{group.title}</h3>
          <ol className="mt-4 flex list-none flex-col gap-4 p-0">
            {group.entries
              .filter((entry) =>
                entry.text
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((entry) => (
                <li
                  className={
                    entry.id === selectedEntry
                      ? "rounded border border-primary p-3"
                      : "p-3"
                  }
                  id={entry.id}
                  key={entry.id}
                  ref={
                    entry.id === selectedEntry ? selectedEntryRef : undefined
                  }
                  tabIndex={entry.id === selectedEntry ? -1 : undefined}
                >
                  <p>{entry.text}</p>
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
                  {mentions.get(entry.id)?.map((mentionId) => (
                    <Button
                      className="mt-2 mr-2"
                      key={mentionId}
                      onClick={() => onReturn(mentionId)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Back to citation
                    </Button>
                  ))}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </section>
  );
}

function citationMentions(component: SepReadingData["components"][number]) {
  const mentions = new Map<string, string[]>();
  const visit = (
    values: SepReadingData["components"][number]["sections"][number]["title"],
  ) => {
    for (const value of values) {
      if (value.kind === "citation" && value.entryId) {
        mentions.set(value.entryId, [
          ...(mentions.get(value.entryId) ?? []),
          value.mentionId,
        ]);
      } else if ("children" in value) visit(value.children);
    }
  };
  const visitBlocks = (
    blocks: SepReadingData["components"][number]["introductoryBlocks"],
  ) => {
    for (const block of blocks) visitBlockInlines(block, visit);
  };
  const visitSections = (
    sections: SepReadingData["components"][number]["sections"],
  ) => {
    for (const section of sections) {
      visit(section.title);
      visitBlocks(section.blocks);
      visitSections(section.children);
    }
  };
  visitBlocks(component.introductoryBlocks);
  visitSections(component.sections);
  return mentions;
}

function visitBlockInlines(
  block: SepReadingData["components"][number]["introductoryBlocks"][number],
  visit: (
    values: SepReadingData["components"][number]["sections"][number]["title"],
  ) => void,
) {
  if (block.kind === "statement") {
    visit(block.label);
    visit(block.body);
    return;
  }
  if (block.kind === "list") {
    for (const item of block.items) visit(item);
    return;
  }
  if (block.kind === "table") {
    visit(block.caption);
    for (const row of [...block.head, ...block.body])
      for (const cell of row.cells) visit(cell);
    return;
  }
  if (block.kind === "figure") {
    visit(block.figure.caption);
    visit(block.figure.description.text);
    return;
  }
  if (block.kind !== "diagnostic") visit(block.children);
}
