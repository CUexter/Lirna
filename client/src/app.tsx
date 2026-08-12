import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import type { AppRouter } from "@/router";

/**
 * The composed application shell: TanStack Query provides server-state context
 * and TanStack Router renders the routes. Both dependencies are injected so the
 * shell can be mounted in a browser or a test with equal fidelity.
 */
export function App({
  queryClient,
  router,
}: {
  queryClient: QueryClient;
  router: AppRouter;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
