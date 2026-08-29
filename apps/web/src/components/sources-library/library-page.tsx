import { useState } from "react";

import { OfflineWorkingSetInventory } from "@/offline-working-set/offline-working-set-inventory";

import { EmptyLibrary } from "./empty";
import { LibraryHeader } from "./header";
import { LibraryOverview } from "./overview";
import { SourceResults } from "./results";
import { LibraryToolbar } from "./toolbar";
import type { LibrarySource } from "./types";

export function LibraryPage({
  deletingSourceId,
  deleteError,
  onDelete,
  sources,
}: {
  deletingSourceId: string | undefined;
  deleteError: string | undefined;
  onDelete: (sourceId: string) => void;
  sources: LibrarySource[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSources = sources
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
        {deleteError ? (
          <p className="mb-4 text-destructive text-sm" role="alert">
            Could not delete Source: {deleteError}
          </p>
        ) : null}
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
              onDelete={onDelete}
              query={query}
              deletingSourceId={deletingSourceId}
              sources={filteredSources}
            />
          </>
        ) : null}
        <OfflineWorkingSetInventory />
      </div>
    </main>
  );
}
