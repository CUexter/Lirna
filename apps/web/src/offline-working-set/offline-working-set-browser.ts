import { hashKey } from "@tanstack/react-query";

import { inquiry } from "@/clients/inquiry";
import { queryClient } from "@/utils/query-client";
import type { OfflineWorkingSetTarget } from "./offline-working-set";
import { indexedDbOfflineWorkingSetStorage } from "./offline-working-set-storage";
import { createOfflineWorkingSets } from "./offline-working-set-store";

export function createBrowserOfflineWorkingSets() {
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
