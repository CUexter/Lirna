import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { z } from "zod";

import { inquiry } from "@/clients/inquiry";
import { library } from "@/clients/library";
import {
  historyPositionKey,
  writeReadingHistoryPosition,
} from "@/components/reading-workspace/reading-history-position";
import { SepReadingWorkspace } from "@/components/reading-workspace/workspace";
import { readOfflineWorkingSet } from "@/offline-working-set/offline-working-set-store";
import { queryClient } from "@/utils/query-client";

const SourceInformation = lazy(() =>
  import("@/components/reading-workspace/source-information").then(
    (module) => ({
      default: module.SourceInformation,
    }),
  ),
);

export const Route = createFileRoute("/sources/$sourceId/$stateId")({
  validateSearch: z.object({
    component: z.string().optional(),
    view: z.enum(["article", "bibliography"]).optional(),
    citation: z.string().optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { sourceId, stateId } = Route.useParams();
  const { component, view, citation } = Route.useSearch();
  const { hash } = useLocation();
  const navigate = Route.useNavigate();
  const workspace = useQuery(
    inquiry.sources.readingWorkspace.queryOptions({
      input: { sourceId, stateId },
      retry: false,
    }),
  );
  const retained = useQuery({
    queryKey: ["offline-working-set", sourceId, stateId],
    queryFn: async () =>
      (await readOfflineWorkingSet(sourceId, stateId)) ?? null,
  });
  const [hydratedReplica, setHydratedReplica] = useState<string>();
  const replicaKey = `${sourceId}:${stateId}`;
  useEffect(() => {
    if (!(retained.data && !workspace.data)) return;
    const annotationInput = { sourceId, stateId };
    queryClient.setQueryData(
      library.annotations.list.queryOptions({ input: annotationInput })
        .queryKey,
      retained.data.replica.annotations,
    );
    for (const position of retained.data.replica.positions) {
      const resumeInput = {
        sourceId,
        stateId,
        componentIdentity: position.componentIdentity,
      };
      queryClient.setQueryData(
        inquiry.sources.resume.get.queryOptions({ input: resumeInput })
          .queryKey,
        position,
      );
      if (position.semanticLocation) {
        writeReadingHistoryPosition(
          historyPositionKey(sourceId, stateId, position.componentIdentity),
          position.semanticLocation,
        );
      }
    }
    setHydratedReplica(replicaKey);
  }, [replicaKey, retained.data, sourceId, stateId, workspace.data]);
  const retainedWorkspace =
    hydratedReplica === replicaKey
      ? retained.data?.replica.workspace
      : undefined;
  const availableWorkspace = workspace.data ?? retainedWorkspace;

  if (!availableWorkspace && (workspace.isPending || retained.isPending)) {
    return (
      <main className="p-6 text-muted-foreground">
        Loading Reading workspace…
      </main>
    );
  }
  if (!availableWorkspace) {
    return (
      <main className="p-6">
        <h1 className="font-serif text-2xl">Reading workspace unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {workspace.error?.message ??
            retained.error?.message ??
            "No retained Offline working set is available."}
        </p>
      </main>
    );
  }
  return (
    <>
      {!workspace.data ? (
        <p
          className="border-b bg-amber-50 px-4 py-2 text-amber-950 text-sm"
          role="status"
        >
          Backend unavailable. Reading the verified replica retained on this
          Client installation.
        </p>
      ) : null}
      <SepReadingWorkspace
        initialFragment={hash}
        selectedComponent={component}
        view={view ?? "article"}
        workspace={availableWorkspace}
        selectedCitation={citation}
        onFragmentChange={(fragment) =>
          navigate({
            search: {
              component,
            },
            hash: fragment,
            hashScrollIntoView: false,
            resetScroll: false,
          })
        }
        onComponentChange={(identity) =>
          navigate({
            search: {
              component: identity,
            },
            hash: "",
            resetScroll: false,
          })
        }
        onViewChange={(nextView, nextCitation) =>
          navigate({
            search: {
              component,
              ...(nextView === "bibliography" ? { view: nextView } : {}),
              ...(nextCitation ? { citation: nextCitation } : {}),
            },
            resetScroll: false,
          })
        }
      />
      <Suspense fallback={null}>
        <SourceInformation workspace={availableWorkspace} />
      </Suspense>
    </>
  );
}
