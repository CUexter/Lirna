import { hashKey } from "@tanstack/react-query";

import { inquiry } from "@/clients/inquiry";
import { library } from "@/clients/library";
import { queryClient } from "@/infrastructure/queryClient";
import { inspectBrowserAppShell } from "./appShellCompatibility";
import { createBrowserOfflineWorkingSetLifecycle } from "./lifecycle";
import { indexedDbOfflineWorkingSetStorage } from "./storage";
import { createOfflineWorkingSets } from "./store";
import type { OfflineWorkingSetTarget } from "./workingSets";

export function createBrowserOfflineWorkingSets() {
  const lifecycle = createBrowserOfflineWorkingSetLifecycle();
  const workingSets = createOfflineWorkingSets({
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
    runExclusive: (target, operation) =>
      navigator.locks.request(
        `lirna-offline-working-set:${target.sourceId}:${target.stateId}`,
        operation,
      ),
    savePosition: (input) =>
      queryClient
        .getMutationCache()
        .build(queryClient, inquiry.sources.resume.save.mutationOptions())
        .execute(input),
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
  window.addEventListener("online", () => {
    void workingSets.synchronizeProgress();
  });
  if (navigator.onLine && "indexedDB" in window)
    void workingSets.synchronizeProgress();
  return workingSets;
}

function currentnessQuery(target: OfflineWorkingSetTarget) {
  return inquiry.sources.readingWorkspace.queryOptions({
    input: target,
    staleTime: 0,
  });
}
