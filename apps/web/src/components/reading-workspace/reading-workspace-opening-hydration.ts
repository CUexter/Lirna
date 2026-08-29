import {
  hashKey,
  type QueryClient,
  type QueryKey,
  type QueryState,
} from "@tanstack/react-query";

import { type InquiryOutputs, inquiry } from "@/clients/inquiry";
import { library } from "@/clients/library";
import type { RetainedReadingWorkspace } from "@/offline-working-set/offline-working-set";
import {
  historyPositionKey,
  removeReadingHistoryPosition,
  writeReadingHistoryPosition,
} from "./reading-history-position";

type ReadingWorkspaceData = InquiryOutputs["sources"]["readingWorkspace"];

export type RetainedOpening =
  | {
      key: string;
      retainedAt: string;
      seededHistoryKeys: string[];
      seededQueryKeys: QueryKey[];
      status: "ready";
      targetKey: string;
      workspace: ReadingWorkspaceData;
    }
  | {
      key: string;
      retainedAt: string;
      status: "failed";
      targetKey: string;
      message: string;
    };

export function shouldHydrateRetained({
  onlineWorkspace,
  opening,
  reading,
  retainedKey,
  targetKey,
}: {
  onlineWorkspace: ReadingWorkspaceData | undefined;
  opening: RetainedOpening | undefined;
  reading:
    | Extract<RetainedReadingWorkspace, { status: "available" }>
    | undefined;
  retainedKey: string | undefined;
  targetKey: string;
}) {
  if (!(reading && retainedKey) || onlineWorkspace) return false;
  if (opening?.key === retainedKey) return false;
  return !(
    opening?.targetKey === targetKey && opening.retainedAt >= reading.retainedAt
  );
}

export function hydrateRetainedWorkspace({
  priorSeededHistoryKeys,
  priorSeededQueryKeys,
  queryClient,
  reading,
  retainedKey,
  sourceId,
  stateId,
  targetKey,
}: {
  priorSeededHistoryKeys: string[] | undefined;
  priorSeededQueryKeys: QueryKey[] | undefined;
  queryClient: QueryClient;
  reading: Extract<RetainedReadingWorkspace, { status: "available" }>;
  retainedKey: string;
  sourceId: string;
  stateId: string;
  targetKey: string;
}): RetainedOpening {
  const querySnapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }> = [];
  const historyState = window.history.state;
  try {
    const { seededHistoryKeys, seededQueryKeys } = installRetainedQueries({
      priorSeededHistoryKeys,
      priorSeededQueryKeys,
      queryClient,
      querySnapshots,
      reading,
      sourceId,
      stateId,
    });
    return {
      key: retainedKey,
      retainedAt: reading.retainedAt,
      seededHistoryKeys,
      seededQueryKeys,
      status: "ready",
      targetKey,
      workspace: reading.workspace,
    };
  } catch (error) {
    const rollbackError = rollbackHydration(
      queryClient,
      querySnapshots,
      historyState,
    );
    return {
      key: retainedKey,
      retainedAt: reading.retainedAt,
      status: "failed",
      targetKey,
      message:
        rollbackError instanceof Error
          ? `${errorMessage(error)} Rollback failed: ${rollbackError.message}`
          : errorMessage(error),
    };
  }
}

export function reconcileRetainedQueries({
  onlineWorkspace,
  opening,
  queryClient,
  reconciledKey,
  targetKey,
}: {
  onlineWorkspace: ReadingWorkspaceData | undefined;
  opening: RetainedOpening | undefined;
  queryClient: QueryClient;
  reconciledKey: string | undefined;
  targetKey: string;
}) {
  if (
    !onlineWorkspace ||
    opening?.status !== "ready" ||
    opening.targetKey !== targetKey ||
    reconciledKey === opening.key
  )
    return undefined;
  for (const queryKey of opening.seededQueryKeys) {
    void queryClient.invalidateQueries({ exact: true, queryKey });
  }
  return opening.key;
}

function installRetainedQueries({
  priorSeededHistoryKeys,
  priorSeededQueryKeys,
  queryClient,
  querySnapshots,
  reading,
  sourceId,
  stateId,
}: {
  priorSeededHistoryKeys: string[] | undefined;
  priorSeededQueryKeys: QueryKey[] | undefined;
  queryClient: QueryClient;
  querySnapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>;
  reading: Extract<RetainedReadingWorkspace, { status: "available" }>;
  sourceId: string;
  stateId: string;
}) {
  for (const queryKey of priorSeededQueryKeys ?? []) {
    snapshotQuery(queryClient, querySnapshots, queryKey);
    queryClient.removeQueries({ exact: true, queryKey });
  }
  for (const historyKey of priorSeededHistoryKeys ?? []) {
    removeReadingHistoryPosition(historyKey);
  }
  const annotationKey = library.annotations.list.queryOptions({
    input: { sourceId, stateId },
  }).queryKey;
  const seededHistoryKeys: string[] = [];
  const seededQueryKeys: QueryKey[] = [annotationKey];
  snapshotQuery(queryClient, querySnapshots, annotationKey);
  queryClient.setQueryData(annotationKey, reading.annotations);
  for (const position of reading.positions) {
    const positionKey = inquiry.sources.resume.get.queryOptions({
      input: {
        sourceId,
        stateId,
        componentIdentity: position.componentIdentity,
      },
    }).queryKey;
    seededQueryKeys.push(positionKey);
    snapshotQuery(queryClient, querySnapshots, positionKey);
    queryClient.setQueryData(positionKey, position);
    if (position.semanticLocation) {
      const historyKey = historyPositionKey(
        sourceId,
        stateId,
        position.componentIdentity,
      );
      seededHistoryKeys.push(historyKey);
      writeReadingHistoryPosition(historyKey, position.semanticLocation);
    }
  }
  return { seededHistoryKeys, seededQueryKeys };
}

function snapshotQuery(
  queryClient: QueryClient,
  snapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>,
  queryKey: QueryKey,
) {
  const queryHash = hashKey(queryKey);
  if (snapshots.some((snapshot) => hashKey(snapshot.queryKey) === queryHash)) {
    return;
  }
  snapshots.push({ queryKey, state: queryClient.getQueryState(queryKey) });
}

function rollbackHydration(
  queryClient: QueryClient,
  snapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>,
  historyState: unknown,
) {
  let rollbackError: unknown;
  try {
    for (const snapshot of snapshots.toReversed()) {
      if (snapshot.state) {
        const cache = queryClient.getQueryCache();
        const query = cache.find({ exact: true, queryKey: snapshot.queryKey });
        if (query) query.setState(snapshot.state);
        else {
          cache.build(
            queryClient,
            { queryKey: snapshot.queryKey },
            snapshot.state,
          );
        }
      } else {
        queryClient.removeQueries({ exact: true, queryKey: snapshot.queryKey });
      }
    }
  } catch (failure) {
    rollbackError = failure;
  }
  try {
    window.history.replaceState(historyState, "");
  } catch (failure) {
    rollbackError ??= failure;
  }
  return rollbackError;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Retained Reading workspace hydration failed.";
}
