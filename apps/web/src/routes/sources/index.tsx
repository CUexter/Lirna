import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { library } from "@/clients/library";
import { offlineWorkingSets } from "@/features/offline-working-set/workingSets";
import { LibraryPage } from "@/features/source-library/components/Page";

export const Route = createFileRoute("/sources/")({
  component: RouteComponent,
});

function RouteComponent() {
  const sources = useQuery(library.sources.list.queryOptions({ input: {} }));
  const deletion = library.sources.delete.mutationOptions();
  const deleteSource = useMutation({
    ...deletion,
    mutationFn: (input, context) =>
      offlineWorkingSets.reconcileSourceDeletion(input.sourceId, () => {
        if (!deletion.mutationFn)
          throw new Error("Source deletion operation is unavailable");
        return deletion.mutationFn(input, context);
      }),
  });
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sourceData = (sources.data ?? []).filter(
    (source) => !deletedSourceIds.has(source.id),
  );

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

  return (
    <LibraryPage
      deletingSourceId={
        deleteSource.isPending ? deleteSource.variables.sourceId : undefined
      }
      deleteError={deleteSource.error?.message}
      onDelete={(sourceId) => {
        deleteSource.mutate(
          { sourceId },
          {
            onSuccess: () => {
              setDeletedSourceIds((ids) => new Set(ids).add(sourceId));
              void sources.refetch();
            },
          },
        );
      }}
      sources={sourceData}
    />
  );
}
