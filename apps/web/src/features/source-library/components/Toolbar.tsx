import { Button } from "@lirna/ui/components/button";
import { Input } from "@lirna/ui/components/input";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";

export function LibraryToolbar({
  query,
  setQuery,
  setSort,
  sort,
}: {
  query: string;
  setQuery: (value: string) => void;
  setSort: (value: "recent" | "title") => void;
  sort: "recent" | "title";
}) {
  return (
    <section
      aria-label="Find a Source"
      className="mt-8 flex flex-col gap-3 sm:flex-row"
    >
      <div className="relative min-w-0 flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search Sources"
          className="h-9 border-border bg-card pr-3 pl-9 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your library"
          type="search"
          value={query}
        />
      </div>
      <Button
        aria-label="Sort Sources"
        className="h-9 gap-2 border-border bg-card px-3 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
        onClick={() => setSort(sort === "recent" ? "title" : "recent")}
        variant="outline"
      >
        <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
        <span className="font-medium text-foreground">
          {sort === "recent" ? "Recently admitted" : "Title"}
        </span>
      </Button>
    </section>
  );
}
