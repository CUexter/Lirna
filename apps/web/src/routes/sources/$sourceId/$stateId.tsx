import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { inquiry } from "@/clients/inquiry";
import { SepReadingWorkspace } from "@/components/reading-workspace/workspace";

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
  const navigate = Route.useNavigate();
  const reading = useQuery(
    inquiry.sources.reading.queryOptions({ input: { sourceId, stateId } }),
  );

  if (reading.isPending) {
    return (
      <main className="p-6 text-muted-foreground">
        Loading Reading workspace…
      </main>
    );
  }
  if (reading.isError) {
    return (
      <main className="p-6">
        <h1 className="font-serif text-2xl">Reading workspace unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {reading.error.message}
        </p>
      </main>
    );
  }
  return (
    <SepReadingWorkspace
      reading={reading.data}
      selectedComponent={component}
      view={view ?? "article"}
      selectedCitation={citation}
      onComponentChange={(identity) =>
        navigate({
          search: { component: identity },
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
  );
}
