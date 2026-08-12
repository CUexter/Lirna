import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";

import { TracerRoute } from "@/routes/tracer";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TracerRoute,
});

const routeTree = rootRoute.addChildren([indexRoute]);

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
