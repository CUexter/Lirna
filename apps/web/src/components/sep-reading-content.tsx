import { Button } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import type { InquiryOutputs } from "@/clients/inquiry";

export type SepReadingData = InquiryOutputs["sepAdmission"]["reading"];

export const CitationActions = createContext<{
  open: (entryId: string | undefined, mentionId: string) => void;
} | null>(null);

export function Figure({
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

export function ReadingSection({
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

export function Blocks({
  blocks,
}: {
  blocks: SepReadingData["introductoryBlocks"];
}) {
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

export function Diagnostic({
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
