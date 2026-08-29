import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import type { LibrarySource } from "../types";
import { SourceCard } from "./Card";

export function SourceResults({
  onClear,
  onDelete,
  query,
  deletingSourceId,
  sources,
}: {
  onClear: () => void;
  onDelete: (sourceId: string) => void;
  query: string;
  deletingSourceId: string | undefined;
  sources: LibrarySource[];
}) {
  return (
    <>
      <div className="mt-5 flex items-center justify-between text-muted-foreground text-xs">
        <p>
          {sources.length} {sources.length === 1 ? "Source" : "Sources"}
        </p>
        {query ? (
          <Button
            className="underline underline-offset-2 hover:text-foreground"
            onClick={onClear}
            size="xs"
            type="button"
            variant="ghost"
          >
            Clear search
          </Button>
        ) : null}
      </div>
      {sources.length > 0 ? (
        <section
          aria-label="Admitted Sources"
          className="mt-3 grid items-start gap-4 md:grid-cols-2"
        >
          {sources.map((source) => (
            <SourceCard
              deleting={source.id === deletingSourceId}
              key={source.id}
              onDelete={onDelete}
              source={source}
            />
          ))}
        </section>
      ) : (
        <Card className="mt-3 border-dashed">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Nothing matches “{query}”
            </CardTitle>
            <CardDescription>
              Try a different title or clear the search to see every admitted
              Source.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
