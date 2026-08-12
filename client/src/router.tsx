import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  type RouterHistory,
} from "@tanstack/react-router";

import { TracerRoute } from "@/routes/tracer";
import { SourceReaderRoute, SourcesRoute } from "@/routes/sources";

const rootRoute = createRootRoute({
  component: AppShell,
});

function AppShell() {
  const destinations = ["Research", "Read", "Learn", "Notes"] as const;
  return (
    <>
      <header className="border-b border-border bg-background/90">
        <nav aria-label="Primary" className="mx-auto flex w-[min(72rem,calc(100%-2rem))] items-center gap-5 overflow-x-auto py-4 text-sm">
          <Link to="/" className="mr-auto font-semibold tracking-wide text-primary">Lirna</Link>
          {destinations.slice(0, 3).map((destination) => (
            <Link
              key={destination}
              to="/destinations/$destination"
              params={{ destination: destination.toLowerCase() }}
              className="whitespace-nowrap text-muted-foreground hover:text-foreground"
            >
              {destination}
            </Link>
          ))}
          <Link to="/sources" className="whitespace-nowrap text-muted-foreground hover:text-foreground">Sources</Link>
          <Link to="/destinations/$destination" params={{ destination: "notes" }} className="whitespace-nowrap text-muted-foreground hover:text-foreground">Notes</Link>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TracerRoute,
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources",
  component: SourcesRoute,
});

const sourceReaderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources/$sourceId",
  component: () => {
    const { sourceId } = sourceReaderRoute.useParams();
    return <SourceReaderRoute sourceId={sourceId} />;
  },
});

const destinationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/destinations/$destination",
  component: () => {
    const { destination } = destinationRoute.useParams();
    return <main className="mx-auto w-[min(48rem,calc(100%-2rem))] py-20"><h1 className="text-5xl capitalize">{destination}</h1><p className="mt-4 text-muted-foreground">This destination is ready for later capabilities.</p></main>;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, sourcesRoute, sourceReaderRoute, destinationRoute]);

/**
 * TanStack Router owns URL and navigation state and provides the application
 * shell. Routing is a browser concern; the history can be injected so the shell
 * can be mounted without a real browser URL.
 */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
