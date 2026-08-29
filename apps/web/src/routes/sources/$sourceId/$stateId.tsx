import { createFileRoute, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";

import { useReadingWorkspaceOpening } from "@/components/reading-workspace/reading-workspace-opening";
import { ReadingWorkspace } from "@/components/reading-workspace/workspace";

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
  const opening = useReadingWorkspaceOpening({
    sourceId,
    stateId,
  });

  if (opening.status === "opening") {
    return (
      <main className="p-6 text-muted-foreground">
        Loading Reading workspace…
      </main>
    );
  }
  if (opening.status === "unavailable") {
    return (
      <main className="p-6">
        <h1 className="font-serif text-2xl">Reading workspace unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {opening.message}
        </p>
      </main>
    );
  }
  return (
    <>
      {opening.origin === "retained" ? (
        <p
          className="border-b bg-amber-50 px-4 py-2 text-amber-950 text-sm"
          role="status"
        >
          Backend unavailable. Reading the verified replica retained on this
          Client installation.
        </p>
      ) : null}
      <ReadingWorkspace
        initialFragment={hash}
        model={{
          citationResolutions: opening.workspace.citationResolutions,
          evidenceAccess: opening.origin,
          reading: opening.workspace.reading,
          state: opening.workspace.state,
        }}
        selectedComponent={component}
        view={view ?? "article"}
        selectedCitation={citation}
        navigation={{
          onComponentChange: (identity) =>
            navigate({
              search: {
                component: identity,
              },
              hash: "",
              resetScroll: false,
            }),
          onFragmentChange: (fragment) =>
            navigate({
              search: {
                component,
              },
              hash: fragment,
              hashScrollIntoView: false,
              resetScroll: false,
            }),
          onViewChange: (nextView, nextCitation) =>
            navigate({
              search: {
                component,
                ...(nextView === "bibliography" ? { view: nextView } : {}),
                ...(nextCitation ? { citation: nextCitation } : {}),
              },
              resetScroll: false,
            }),
          onWorkspaceLeave: (href) => window.location.assign(href),
        }}
      />
      <Suspense fallback={null}>
        <SourceInformation workspace={opening.workspace} />
      </Suspense>
    </>
  );
}
