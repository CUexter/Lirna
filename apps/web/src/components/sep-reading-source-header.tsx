import { Badge } from "@lirna/ui/components/badge";

import type { SepReadingData } from "./sep-reading-content";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function SepReadingSourceHeader({
  source,
  component,
  capture,
}: {
  source: SepReadingData["source"];
  component: SepReadingData["components"][number];
  capture: SepReadingData["capture"];
}) {
  return (
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
        <p className="text-muted-foreground">{source.authors.join(", ")}</p>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">Publisher</dt>
          <dd>{source.publisher}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">State date</dt>
          <dd>{formatDate(source.admittedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Edition history</dt>
          <dd>{source.publicationHistory.join("; ") || "Not recorded"}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Captured</dt>
          <dd>{formatDate(component.retrievedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}
