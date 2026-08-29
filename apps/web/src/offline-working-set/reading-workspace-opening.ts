import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { type InquiryOutputs, inquiry } from "@/clients/inquiry";
import {
  offlineWorkingSets,
  type RetainedReadingWorkspace,
} from "./offline-working-set";
import {
  hydrateRetainedWorkspace,
  type RetainedOpening,
  reconcileRetainedQueries,
  shouldHydrateRetained,
} from "./retained-reading-hydration";

type ReadingWorkspaceData = InquiryOutputs["sources"]["readingWorkspace"];

export interface ReadingWorkspaceTarget {
  sourceId: string;
  stateId: string;
}

export type ReadingWorkspaceOpening =
  | { status: "opening" }
  | {
      status: "ready";
      origin: "online" | "retained";
      workspace: ReadingWorkspaceData;
    }
  | {
      status: "unavailable";
      reason:
        | "not-found"
        | "unreachable"
        | "not-retained"
        | "retained-invalid"
        | "retained-hydration-failed";
      message: string;
    };

export function useReadingWorkspaceOpening({
  sourceId,
  stateId,
}: ReadingWorkspaceTarget): ReadingWorkspaceOpening {
  const queryClient = useQueryClient();
  const online = useQuery(
    inquiry.sources.readingWorkspace.queryOptions({
      input: { sourceId, stateId },
      retry: false,
    }),
  );
  const retained = useQuery({
    queryKey: ["offline-working-set", sourceId, stateId],
    queryFn: () => offlineWorkingSets.open({ sourceId, stateId }),
    networkMode: "always",
  });
  const retainedReading = availableRetainedReading(retained.data);
  const [retainedOpening, setRetainedOpening] = useState<RetainedOpening>();
  const [reconciledRetainedKey, setReconciledRetainedKey] = useState<string>();
  const targetKey = JSON.stringify([sourceId, stateId]);
  const priorSeededQueryKeys =
    retainedOpening?.status === "ready" &&
    retainedOpening.targetKey === targetKey
      ? retainedOpening.seededQueryKeys
      : undefined;
  const priorSeededHistoryKeys =
    retainedOpening?.status === "ready" &&
    retainedOpening.targetKey === targetKey
      ? retainedOpening.seededHistoryKeys
      : undefined;
  const retainedKey = retainedReading
    ? JSON.stringify([
        sourceId,
        stateId,
        retainedReading.retainedAt,
        retainedReading.revision,
      ])
    : undefined;

  useEffect(() => {
    if (
      !shouldHydrateRetained({
        onlineWorkspace: online.data,
        opening: retainedOpening,
        reading: retainedReading,
        retainedKey,
        targetKey,
      }) ||
      !(retainedReading && retainedKey)
    )
      return;
    setRetainedOpening(
      hydrateRetainedWorkspace({
        priorSeededHistoryKeys,
        priorSeededQueryKeys,
        queryClient,
        reading: retainedReading,
        retainedKey,
        sourceId,
        stateId,
        targetKey,
      }),
    );
  }, [
    online.data,
    priorSeededHistoryKeys,
    priorSeededQueryKeys,
    queryClient,
    retainedReading,
    retainedKey,
    retainedOpening,
    sourceId,
    stateId,
    targetKey,
  ]);

  useEffect(() => {
    const reconciled = reconcileRetainedQueries({
      onlineWorkspace: online.data,
      opening: retainedOpening,
      queryClient,
      reconciledKey: reconciledRetainedKey,
      targetKey,
    });
    if (reconciled) setReconciledRetainedKey(reconciled);
  }, [
    online.data,
    queryClient,
    reconciledRetainedKey,
    retainedOpening,
    targetKey,
  ]);

  return selectOpening({
    onlineError: online.error,
    onlinePending: online.isPending,
    onlineWorkspace: online.data,
    reconciledRetainedKey,
    retainedAt: retainedReading?.retainedAt,
    retainedError: retained.error,
    retainedKey,
    retainedOpening,
    retainedPending: retained.isPending,
    targetKey,
  });
}

function availableRetainedReading(
  reading: RetainedReadingWorkspace | undefined,
) {
  return reading?.status === "available" ? reading : undefined;
}

function selectOpening({
  onlineError,
  onlinePending,
  onlineWorkspace,
  reconciledRetainedKey,
  retainedAt,
  retainedError,
  retainedKey,
  retainedOpening,
  retainedPending,
  targetKey,
}: {
  onlineError: Error | null;
  onlinePending: boolean;
  onlineWorkspace: ReadingWorkspaceData | undefined;
  reconciledRetainedKey: string | undefined;
  retainedAt: string | undefined;
  retainedError: Error | null;
  retainedKey: string | undefined;
  retainedOpening: RetainedOpening | undefined;
  retainedPending: boolean;
  targetKey: string;
}): ReadingWorkspaceOpening {
  const readyOpening = selectReadyOpening({
    onlineWorkspace,
    reconciledRetainedKey,
    retainedAt,
    retainedKey,
    retainedOpening,
    targetKey,
  });
  if (readyOpening) return readyOpening;
  if (
    onlinePending ||
    retainedPending ||
    (retainedAt && retainedOpening?.key !== retainedKey)
  ) {
    return { status: "opening" };
  }
  if (onlineError) {
    return {
      status: "unavailable",
      reason: onlineFailureReason(onlineError),
      message: onlineError.message,
    };
  }
  if (
    retainedKey &&
    retainedOpening?.key === retainedKey &&
    retainedOpening.status === "failed"
  ) {
    return {
      status: "unavailable",
      reason: "retained-hydration-failed",
      message: retainedOpening.message,
    };
  }
  if (retainedError) {
    return {
      status: "unavailable",
      reason: "retained-invalid",
      message: retainedError.message,
    };
  }
  return {
    status: "unavailable",
    reason: "not-retained",
    message: "No retained Offline working set is available.",
  };
}

function selectReadyOpening({
  onlineWorkspace,
  reconciledRetainedKey,
  retainedAt,
  retainedKey,
  retainedOpening,
  targetKey,
}: {
  onlineWorkspace: ReadingWorkspaceData | undefined;
  reconciledRetainedKey: string | undefined;
  retainedAt: string | undefined;
  retainedKey: string | undefined;
  retainedOpening: RetainedOpening | undefined;
  targetKey: string;
}): ReadingWorkspaceOpening | undefined {
  if (onlineWorkspace) {
    if (
      retainedOpening?.status === "ready" &&
      retainedOpening.targetKey === targetKey &&
      reconciledRetainedKey !== retainedOpening.key
    ) {
      return {
        status: "ready",
        origin: "retained",
        workspace: retainedOpening.workspace,
      };
    }
    return { status: "ready", origin: "online", workspace: onlineWorkspace };
  }
  if (
    retainedAt &&
    retainedOpening?.status === "ready" &&
    retainedOpening.targetKey === targetKey &&
    retainedOpening.retainedAt >= retainedAt
  ) {
    return {
      status: "ready",
      origin: "retained",
      workspace: retainedOpening.workspace,
    };
  }
  if (
    retainedKey &&
    retainedOpening?.key === retainedKey &&
    retainedOpening.status === "ready"
  ) {
    return {
      status: "ready",
      origin: "retained",
      workspace: retainedOpening.workspace,
    };
  }
  return undefined;
}

function onlineFailureReason(error: Error) {
  return "code" in error && error.code === "NOT_FOUND"
    ? ("not-found" as const)
    : ("unreachable" as const);
}
