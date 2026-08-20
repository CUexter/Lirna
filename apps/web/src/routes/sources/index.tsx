import { Badge } from "@lirna/ui/components/badge";
import { Button, buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Input } from "@lirna/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  Layers3Icon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { library } from "@/clients/library";

type LibrarySource = {
  id: string;
  title: string;
  admittedAt: string;
  states: Array<{
    id: string;
    sequence: number;
    observationKey: string;
  }>;
};

export const Route = createFileRoute("/sources/")({
  component: RouteComponent,
});

function RouteComponent() {
  const sources = useQuery(library.sources.list.queryOptions({ input: {} }));
  const sourceData = sources.data ?? [];

  if (sources.isPending) {
    return <main className="p-6 text-muted-foreground">Loading Sources…</main>;
  }
  if (sources.isError) {
    return (
      <main className="p-6">
        <h1 className="font-serif text-3xl">Source library unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {sources.error.message}
        </p>
      </main>
    );
  }

  return <LibraryPage sources={sourceData} />;
}

function LibraryPage({ sources }: { sources: LibrarySource[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sources
      .filter((source) =>
        normalizedQuery
          ? source.title.toLocaleLowerCase().includes(normalizedQuery)
          : true,
      )
      .toSorted((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : new Date(b.admittedAt).getTime() - new Date(a.admittedAt).getTime(),
      );
  }, [query, sort, sources]);
  const stateCount = sources.reduce(
    (total, source) => total + source.states.length,
    0,
  );
  const latestAdmission = sources.reduce(
    (latest, source) =>
      !latest || source.admittedAt > latest.admittedAt ? source : latest,
    undefined as LibrarySource | undefined,
  );

  return (
    <main className="min-h-full bg-background">
      <LibraryHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        {sources.length === 0 ? <EmptyLibrary /> : null}
        {sources.length > 0 ? (
          <>
            <LibraryOverview
              latestAdmission={latestAdmission?.admittedAt}
              sourceCount={sources.length}
              stateCount={stateCount}
            />
            <LibraryToolbar
              query={query}
              setQuery={setQuery}
              setSort={setSort}
              sort={sort}
            />
            <SourceResults
              onClear={() => setQuery("")}
              query={query}
              sources={filteredSources}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

function LibraryHeader() {
  return (
    <header className="border-b px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Knowledge · Sources
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">
            Your library
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
            A quiet shelf for the publications you have chosen to study. Open a
            Source to read its latest state or revisit an earlier capture.
          </p>
        </div>
        <Link
          className={buttonVariants({ size: "sm" })}
          to="/sources/admission"
        >
          <PlusIcon data-icon="inline-start" />
          Add Source
        </Link>
      </div>
    </header>
  );
}

function LibraryOverview({
  latestAdmission,
  sourceCount,
  stateCount,
}: {
  latestAdmission: string | undefined;
  sourceCount: number;
  stateCount: number;
}) {
  return (
    <section
      aria-label="Library overview"
      className="grid gap-px border border-border bg-border sm:grid-cols-3"
    >
      <LibraryStat icon={Layers3Icon} label="Sources" value={sourceCount} />
      <LibraryStat
        icon={CalendarDaysIcon}
        label="Source states"
        value={stateCount}
      />
      <LibraryStat
        icon={BookOpenIcon}
        label="Latest admission"
        value={formatRelativeDate(latestAdmission)}
      />
    </section>
  );
}

function LibraryToolbar({
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

function SourceResults({
  onClear,
  query,
  sources,
}: {
  onClear: () => void;
  query: string;
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
          className="mt-3 grid gap-4 md:grid-cols-2"
        >
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
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

function SourceCard({ source }: { source: LibrarySource }) {
  const currentState = source.states[0];
  return (
    <Card className="flex flex-col transition-shadow hover:shadow-[4px_4px_0_var(--border)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">SEP</Badge>
            <span className="text-muted-foreground text-xs">
              {source.states.length}{" "}
              {source.states.length === 1 ? "state" : "states"}
            </span>
          </div>
          <span className="font-mono text-[0.65rem] text-muted-foreground">
            SRC-{String(source.id).slice(0, 4).toUpperCase()}
          </span>
        </div>
        <CardTitle className="max-w-[24rem] font-serif text-2xl leading-tight">
          {source.title}
        </CardTitle>
        <CardDescription>
          Added {formatDate(source.admittedAt)} · Latest state{" "}
          {currentState ? `#${currentState.sequence}` : "unavailable"}
        </CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto flex-wrap gap-2">
        {currentState ? (
          <Link
            className={buttonVariants({ size: "sm" })}
            params={{ sourceId: source.id, stateId: currentState.id }}
            to="/sources/$sourceId/$stateId"
          >
            <BookOpenIcon data-icon="inline-start" />
            Open reading workspace
          </Link>
        ) : null}
        {source.states.length > 1 ? <StateHistory source={source} /> : null}
      </CardFooter>
    </Card>
  );
}

function StateHistory({ source }: { source: LibrarySource }) {
  return (
    <details className="group relative ml-auto">
      <summary className="flex h-7 cursor-pointer list-none items-center gap-1 px-1 text-muted-foreground text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
        Browse states{" "}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute right-0 bottom-8 z-10 min-w-52 border border-border bg-popover p-1 text-popover-foreground shadow-md">
        {source.states.map((state) => (
          <Link
            className="flex items-center justify-between gap-4 px-2 py-1.5 text-xs hover:bg-muted"
            key={state.id}
            params={{ sourceId: source.id, stateId: state.id }}
            to="/sources/$sourceId/$stateId"
          >
            <span>State {state.sequence}</span>
            <span className="text-muted-foreground">
              {formatState(state.observationKey)}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

function LibraryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers3Icon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-4 py-3">
      <Icon aria-hidden="true" className="size-4 text-primary" />
      <div>
        <p className="font-mono text-lg leading-none">{value}</p>
        <p className="mt-1 text-[0.65rem] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </p>
      </div>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <Card className="mb-4 border-dashed">
      <CardHeader>
        <CardTitle className="font-serif text-2xl">No Sources yet</CardTitle>
        <CardDescription>
          Admit a publication to make it available in your reading library.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/sources/admission"
        >
          Add your first Source
        </Link>
      </CardFooter>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatState(value: string | undefined) {
  return value === "recommended-archive" ? "recommended archive" : "active";
}

function formatRelativeDate(value: string | undefined) {
  if (!value) return "—";
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
