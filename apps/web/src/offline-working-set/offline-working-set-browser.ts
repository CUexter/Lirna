import { hashKey } from "@tanstack/react-query";

import { inquiry } from "@/clients/inquiry";
import { library } from "@/clients/library";
import { queryClient } from "@/utils/query-client";
import { inspectBrowserAppShell } from "./app-shell-compatibility";
import type { OfflineWorkingSetTarget } from "./offline-working-set";
import { createBrowserOfflineWorkingSetLifecycle } from "./offline-working-set-lifecycle";
import { indexedDbOfflineWorkingSetStorage } from "./offline-working-set-storage";
import { createOfflineWorkingSets } from "./offline-working-set-store";

export function createBrowserOfflineWorkingSets() {
  const lifecycle = createBrowserOfflineWorkingSetLifecycle();
  return createOfflineWorkingSets({
    fetchSnapshot: (target) =>
      queryClient.fetchQuery(
        inquiry.sources.offlineManifest.queryOptions({
          input: target,
          staleTime: 0,
        }),
      ),
    fetchCurrentness: async (target) => {
      const workspace = await queryClient.fetchQuery(currentnessQuery(target));
      return {
        activationId: workspace.state?.derivatives.find(
          (derivative) => derivative.currentActivation,
        )?.currentActivation?.id,
        currentStateId: workspace.source.currentStateId,
      };
    },
    now: () => new Date(),
    inspectAppShell: inspectBrowserAppShell,
    lifecycle,
    sourceExists: async (sourceId) => {
      const sources = await queryClient.fetchQuery(
        library.sources.list.queryOptions({ input: {}, staleTime: 0 }),
      );
      return sources.some((source) => source.id === sourceId);
    },
    storage: indexedDbOfflineWorkingSetStorage,
    subscribeToCurrentness: (target, onChange) => {
      const queryHash = hashKey(currentnessQuery(target).queryKey);
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "invalidate" &&
          event.query.queryHash === queryHash
        )
          onChange();
      });
      window.addEventListener("online", onChange);
      return () => {
        unsubscribe();
        window.removeEventListener("online", onChange);
      };
    },
  });
}

function currentnessQuery(target: OfflineWorkingSetTarget) {
  return inquiry.sources.readingWorkspace.queryOptions({
    input: target,
    staleTime: 0,
  });
}
