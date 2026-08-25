import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";

import { inquiry } from "@/clients/inquiry";
import { SepReadingWorkspace } from "@/components/reading-workspace/workspace";

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
    }),
  );

  if (workspace.isPending) {
    return (
      <main className="p-6 text-muted-foreground">
        Loading Reading workspace…
      </main>
    );
  }
  if (workspace.isError) {
    return (
      <main className="p-6">
        <h1 className="font-serif text-2xl">Reading workspace unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {workspace.error.message}
        </p>
      </main>
    );
  }
  return (
    <>
      <SepReadingWorkspace
        initialFragment={hash}
        selectedComponent={component}
        view={view ?? "article"}
        workspace={workspace.data}
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
        <SourceInformation workspace={workspace.data} />
      </Suspense>
    </>
  );
}
