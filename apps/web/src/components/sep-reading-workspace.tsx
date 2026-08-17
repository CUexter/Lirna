// biome-ignore lint/style/noExcessiveLinesPerFile: The workspace renderers jointly exhaust the validated Reading derivative contract.
import type { AppRouter } from "@lirna/api/client";
import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Input } from "@lirna/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@lirna/ui/components/native-select";
import { Link } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeftIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

export type SepReadingData =
  inferRouterOutputs<AppRouter>["sepAdmission"]["reading"];

const CitationActions = createContext<{
  open: (entryId: string | undefined, mentionId: string) => void;
} | null>(null);

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function SepReadingWorkspace({
  reading,
  selectedComponent,
  view,
  selectedCitation,
  onComponentChange,
  onViewChange,
}: {
  reading: SepReadingData;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  onComponentChange: (identity: string) => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
}) {
  const { capture, source } = reading;
  const locations = useRef(new Map<string, number>());
  const returnMention = useRef<string | undefined>(undefined);
  const component =
    reading.components.find((item) => item.identity === selectedComponent) ??
    reading.components.find(
      (item) => item.identity === reading.mainComponent.identity,
    ) ??
    reading.components[0];
  useEffect(() => {
    if (!component) return;
    window.scrollTo({ top: locations.current.get(component.identity) ?? 0 });
  }, [component]);
  useEffect(() => {
    if (view !== "article" || !returnMention.current) return;
    document
      .getElementById(returnMention.current)
      ?.scrollIntoView({ block: "center" });
    returnMention.current = undefined;
  }, [view]);
  if (!component) return null;
  const saveLocation = () =>
    locations.current.set(component.identity, window.scrollY);
  const openBibliography = (entryId: string | undefined, mentionId: string) => {
    saveLocation();
    returnMention.current = mentionId;
    onViewChange("bibliography", entryId);
  };
  const returnToCitation = (mentionId: string) => {
    returnMention.current = mentionId;
    onViewChange("article");
  };
  const siblings = reading.components.filter(
    (item) => item.parentIdentity === component.parentIdentity,
  );
  const siblingIndex = siblings.findIndex(
    (item) => item.identity === component.identity,
  );
  const previous = siblings[siblingIndex - 1];
  const next = siblings[siblingIndex + 1];
  const parent = reading.components.find(
    (item) => item.identity === component.parentIdentity,
  );
  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center">
          <Button
            render={<Link hash="source-information" to="." />}
            size="sm"
            variant="ghost"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Source information
          </Button>
          <span className="ml-auto font-semibold font-serif text-xl">
            Lirna
          </span>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-10 lg:py-12">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex flex-col gap-4 rounded-md border p-4">
            <nav aria-label="Source components">
              <h2 className="mb-3 font-medium">This Source</h2>
              <NativeSelect
                aria-label="Source component"
                className="lg:hidden"
                onChange={(event) => {
                  saveLocation();
                  onComponentChange(event.target.value);
                }}
                value={component.identity}
              >
                {reading.components.map((item) => (
                  <NativeSelectOption key={item.identity} value={item.identity}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <ol className="hidden space-y-1 text-sm lg:block">
                {reading.components.map((item) => (
                  <li key={item.identity}>
                    <Button
                      className="h-auto justify-start p-0 text-left text-muted-foreground"
                      onClick={() => {
                        saveLocation();
                        onComponentChange(item.identity);
                      }}
                      type="button"
                      variant="link"
                    >
                      {item.identity === component.identity ? (
                        <strong>{item.label}</strong>
                      ) : (
                        item.label
                      )}
                    </Button>
                  </li>
                ))}
              </ol>
            </nav>
            <nav aria-label="Component contents">
              <h2 className="mb-3 font-medium">Contents</h2>
              <Toc items={component.toc} />
            </nav>
            {component.bibliography.length ? (
              <Button
                onClick={() => {
                  saveLocation();
                  onViewChange("bibliography");
                }}
                type="button"
                variant={view === "bibliography" ? "secondary" : "outline"}
              >
                Bibliography
              </Button>
            ) : null}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-8">
          <header
            className="flex flex-col gap-3 border-b pb-8"
            id="source-information"
          >
            <div className="flex flex-wrap gap-2">
              <Badge>SEP</Badge>
              <Badge variant="outline">
                {source.observation === "submitted"
                  ? "Active capture"
                  : "Archived capture"}
              </Badge>
              <Badge
                variant={
                  capture.readingReadiness === "ready" ? "secondary" : "outline"
                }
              >
                Reading {capture.readingReadiness}
              </Badge>
            </div>
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-5xl">
              {source.title}
            </h1>
            {source.authors.length > 0 ? (
              <p className="text-muted-foreground">
                {source.authors.join(", ")}
              </p>
            ) : null}
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-muted-foreground">Publisher</dt>
                <dd>{source.publisher}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  State date
                </dt>
                <dd>{formatDate(source.admittedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  Edition history
                </dt>
                <dd>
                  {source.publicationHistory.join("; ") || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Captured</dt>
                <dd>{formatDate(component.retrievedAt)}</dd>
              </div>
            </dl>
          </header>
          {capture.readingReadiness === "degraded" ||
          capture.diagnostics.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-xl">
                  Capture and rendering status
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p>
                  Bundle capture is {capture.completeness}; Reading is{" "}
                  {capture.readingReadiness}.
                </p>
                {capture.readinessReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {capture.diagnostics.map((diagnostic) => (
                  <Diagnostic
                    key={`${diagnostic.code}:${diagnostic.source.locator}`}
                    diagnostic={diagnostic}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
          <nav
            aria-label="Component path"
            className="flex flex-wrap gap-2 text-muted-foreground text-sm"
          >
            <Button
              className="h-auto p-0"
              onClick={() => {
                saveLocation();
                onComponentChange(reading.mainComponent.identity);
              }}
              type="button"
              variant="link"
            >
              {source.title}
            </Button>
            {parent ? (
              <>
                <span>/</span>
                <Button
                  className="h-auto p-0"
                  onClick={() => {
                    saveLocation();
                    onComponentChange(parent.identity);
                  }}
                  type="button"
                  variant="link"
                >
                  {parent.label}
                </Button>
              </>
            ) : null}
            <span>/</span>
            <span>{component.label}</span>
          </nav>
          <CitationActions.Provider value={{ open: openBibliography }}>
            {view === "bibliography" ? (
              <Bibliography
                component={component}
                onReturn={returnToCitation}
                selectedEntry={selectedCitation}
              />
            ) : (
              <article className="flex flex-col gap-8 font-serif text-lg leading-8">
                <Blocks blocks={component.introductoryBlocks} />
                {component.sections.map((section) => (
                  <ReadingSection key={section.id} section={section} />
                ))}
                {component.figures.map((figure) => (
                  <Figure figure={figure} key={figure.id} />
                ))}
              </article>
            )}
          </CitationActions.Provider>
          <nav
            aria-label="Component navigation"
            className="flex justify-between gap-3 border-t pt-6"
          >
            {previous ? (
              <Button
                onClick={() => {
                  saveLocation();
                  onComponentChange(previous.identity);
                }}
                type="button"
                variant="outline"
              >
                Previous: {previous.label}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button
                onClick={() => {
                  saveLocation();
                  onComponentChange(next.identity);
                }}
                type="button"
                variant="outline"
              >
                Next: {next.label}
              </Button>
            ) : null}
          </nav>
        </div>
      </div>
    </main>
  );
}

function Figure({
  figure,
}: {
  figure: SepReadingData["components"][number]["figures"][number];
}) {
  return (
    <figure className="rounded border p-4" id={figure.id}>
      {figure.assetDataUrl ? (
        <img
          alt={inlinePlainText(figure.description.text)}
          className="mb-3 h-auto max-w-full"
          height={figure.dimensions.height}
          src={figure.assetDataUrl}
          width={figure.dimensions.width}
        />
      ) : null}
      {figure.caption.length ? (
        <figcaption className="font-medium">
          <Inlines values={figure.caption} />
        </figcaption>
      ) : null}
      {figure.description.text.length ? (
        <p className="mt-2 text-base">
          <Inlines values={figure.description.text} />
        </p>
      ) : null}
      {figure.description.componentIdentity ? (
        <p className="mt-2 text-muted-foreground text-sm">
          Description: <code>{figure.description.componentIdentity}</code>
        </p>
      ) : null}
      {figure.dimensions.width || figure.dimensions.height ? (
        <p className="mt-2 text-muted-foreground text-sm">
          Dimensions: {figure.dimensions.width ?? "?"} x{" "}
          {figure.dimensions.height ?? "?"}
        </p>
      ) : null}
      {figure.diagnostics.map((diagnostic) => (
        <Diagnostic
          diagnostic={diagnostic}
          key={`${diagnostic.code}:${diagnostic.source.locator}`}
        />
      ))}
    </figure>
  );
}

function Toc({ items }: { items: SepReadingData["toc"] }) {
  return (
    <ol className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            className="text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
            href={`#${item.id}`}
          >
            {item.title}
          </a>
          {item.children.length ? (
            <div className="mt-1 ml-3 border-l pl-3">
              <Toc items={item.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
function ReadingSection({
  section,
}: {
  section: SepReadingData["sections"][number];
}) {
  const Heading = `h${section.level}` as "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <section className="flex scroll-mt-6 flex-col gap-5" id={section.id}>
      <Heading className="font-semibold font-serif text-2xl leading-tight tracking-tight sm:text-3xl">
        <Inlines values={section.title} />
      </Heading>
      <Blocks blocks={section.blocks} />
      {section.children.map((child) => (
        <ReadingSection key={child.id} section={child} />
      ))}
    </section>
  );
}
function Blocks({ blocks }: { blocks: SepReadingData["introductoryBlocks"] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block block={block} key={`${block.kind}:${index}`} />
      ))}
    </>
  );
}

function Block({
  block,
}: {
  block: SepReadingData["introductoryBlocks"][number];
}) {
  if (block.kind === "paragraph")
    return (
      <p>
        <Inlines values={block.children} />
      </p>
    );
  if (block.kind === "quotation")
    return (
      <blockquote className="border-l-2 pl-5 italic">
        <Inlines values={block.children} />
      </blockquote>
    );
  if (block.kind === "statement")
    return (
      <dl className="rounded border p-4">
        <dt className="font-semibold">
          <Inlines values={block.label} />
        </dt>
        <dd>
          <Inlines values={block.body} />
        </dd>
      </dl>
    );
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className="list-outside pl-6 marker:text-muted-foreground">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Inlines values={item} />
          </li>
        ))}
      </List>
    );
  }
  if (block.kind === "table")
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <caption className="mb-2 caption-top text-left font-medium">
            <Inlines values={block.caption} />
          </caption>
          {block.head.length ? (
            <thead>
              {block.head.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.cells.map((cell, cellIndex) => (
                    <th className="border p-2 font-semibold" key={cellIndex}>
                      <Inlines values={cell} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
          ) : null}
          <tbody>
            {block.body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.cells.map((cell, cellIndex) => (
                  <td className="border p-2 align-top" key={cellIndex}>
                    <Inlines values={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (block.kind === "diagnostic")
    return <Diagnostic diagnostic={block.diagnostic} />;
  return null;
}
function Inlines({
  values,
}: {
  values: SepReadingData["sections"][number]["title"];
}) {
  const citationActions = useContext(CitationActions);
  return (
    <>
      {values.map((value, index) => (
        <Inline
          citationActions={citationActions}
          key={`${value.kind}:${index}`}
          value={value}
        />
      ))}
    </>
  );
}

function Inline({
  value,
  citationActions,
}: {
  value: SepReadingData["sections"][number]["title"][number];
  citationActions: React.ContextType<typeof CitationActions>;
}) {
  if (value.kind === "text") return <span>{value.text}</span>;
  if (value.kind === "tex")
    return (
      <code
        className={
          value.display
            ? "my-3 block overflow-x-auto rounded bg-muted p-3 text-base"
            : "rounded bg-muted px-1 font-sans text-base"
        }
        title="Original TeX source"
      >
        {value.source}
      </code>
    );
  if (value.kind === "link")
    return (
      <a
        href={value.href}
        className="underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
      >
        <Inlines values={value.children} />
      </a>
    );
  if (value.kind === "citation")
    return (
      <span id={value.mentionId}>
        <Button
          aria-label={`Citation: ${value.label} (${value.state})`}
          className="h-auto p-0 font-serif text-lg"
          onClick={() => citationActions?.open(value.entryId, value.mentionId)}
          type="button"
          variant="link"
        >
          {value.label}
        </Button>{" "}
        <span className="font-sans text-muted-foreground text-sm">
          {value.state}
        </span>
      </span>
    );
  const Element =
    value.kind === "emphasis"
      ? "em"
      : value.kind === "subscript"
        ? "sub"
        : "sup";
  return (
    <Element>
      <Inlines values={value.children} />
    </Element>
  );
}

function Bibliography({
  component,
  selectedEntry,
  onReturn,
}: {
  component: SepReadingData["components"][number];
  selectedEntry?: string;
  onReturn: (mentionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const mentions = citationMentions(component);
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
  if (block.kind !== "diagnostic") visit(block.children);
}

function Diagnostic({
  diagnostic,
}: {
  diagnostic: SepReadingData["capture"]["diagnostics"][number];
}) {
  return (
    <aside
      className="rounded border border-amber-500/50 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
      role="note"
    >
      <p className="font-medium">Rendering note: {diagnostic.code}</p>
      <p>{diagnostic.message}</p>
      <p className="text-sm">
        Captured location: <code>{diagnostic.source.locator}</code>.{" "}
        <Link className="underline" hash="source-information" to=".">
          Review Source information
        </Link>
      </p>
    </aside>
  );
}

function inlinePlainText(
  values: SepReadingData["components"][number]["figures"][number]["description"]["text"],
): string {
  return values
    .map((value) =>
      value.kind === "text"
        ? value.text
        : value.kind === "tex"
          ? value.source
          : value.kind === "citation"
            ? value.label
            : inlinePlainText(value.children),
    )
    .join("")
    .trim();
}
