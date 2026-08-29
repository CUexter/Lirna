import {
  hashKey,
  type QueryClient,
  type QueryKey,
  type QueryState,
} from "@tanstack/react-query";

import { type InquiryOutputs, inquiry } from "@/clients/inquiry";
import { library } from "@/clients/library";
import {
  historyPositionKey,
  historyPositionSavedAt,
  removeReadingHistoryPosition,
  writeReadingHistoryPosition,
} from "@/features/reading-workspace/position/history";
import type { RetainedReadingWorkspace } from "./workingSets";

type ReadingWorkspaceData = InquiryOutputs["sources"]["readingWorkspace"];
type RetainedReading = Extract<
  RetainedReadingWorkspace,
  { status: "available" }
>;
type SeededPosition = {
  historyKey?: string;
  queryKey?: QueryKey;
  savedAt: string;
};

export type RetainedOpening =
  | {
      key: string;
      retainedAt: string;
      seededHistoryKeys: string[];
      seededPositions: SeededPosition[];
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
  priorSeededPositions,
  queryClient,
  reading,
  retainedKey,
  sourceId,
  stateId,
  targetKey,
}: {
  priorSeededPositions?: SeededPosition[];
  queryClient: QueryClient;
  reading: RetainedReading;
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
    const { seededHistoryKeys, seededPositions, seededQueryKeys } =
      installRetainedQueries({
        priorSeededPositions,
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
      seededPositions,
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
  priorSeededPositions,
  queryClient,
  querySnapshots,
  reading,
  sourceId,
  stateId,
}: {
  priorSeededPositions?: SeededPosition[];
  queryClient: QueryClient;
  querySnapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>;
  reading: RetainedReading;
  sourceId: string;
  stateId: string;
}) {
  cleanupPriorSeededPositions(
    priorSeededPositions,
    queryClient,
    querySnapshots,
  );
  const annotationKey = library.annotations.list.queryOptions({
    input: { sourceId, stateId },
  }).queryKey;
  const seededHistoryKeys: string[] = [];
  const seededPositions: SeededPosition[] = [];
  const seededQueryKeys: QueryKey[] = [annotationKey];
  snapshotQuery(queryClient, querySnapshots, annotationKey);
  queryClient.setQueryData(annotationKey, reading.annotations);
  for (const position of reading.positions)
    seedRetainedPosition({
      position,
      queryClient,
      querySnapshots,
      seededHistoryKeys,
      seededPositions,
      seededQueryKeys,
      sourceId,
      stateId,
    });
  return { seededHistoryKeys, seededPositions, seededQueryKeys };
}

function cleanupPriorSeededPositions(
  seededPositions: SeededPosition[] | undefined,
  queryClient: QueryClient,
  querySnapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>,
) {
  for (const seeded of seededPositions ?? []) {
    if (seeded.queryKey) {
      snapshotQuery(queryClient, querySnapshots, seeded.queryKey);
      const current = queryClient.getQueryData<{ savedAt?: string }>(
        seeded.queryKey,
      );
      if (current?.savedAt === seeded.savedAt)
        queryClient.removeQueries({ exact: true, queryKey: seeded.queryKey });
    }
    if (
      seeded.historyKey &&
      historyPositionSavedAt(seeded.historyKey) === seeded.savedAt
    )
      removeReadingHistoryPosition(seeded.historyKey);
  }
}

function seedRetainedPosition({
  position,
  queryClient,
  querySnapshots,
  seededHistoryKeys,
  seededPositions,
  seededQueryKeys,
  sourceId,
  stateId,
}: {
  position: RetainedReading["positions"][number];
  queryClient: QueryClient;
  querySnapshots: Array<{
    queryKey: QueryKey;
    state: QueryState<unknown, Error> | undefined;
  }>;
  seededHistoryKeys: string[];
  seededPositions: SeededPosition[];
  seededQueryKeys: QueryKey[];
  sourceId: string;
  stateId: string;
}) {
  const positionKey = inquiry.sources.resume.get.queryOptions({
    input: { sourceId, stateId, componentIdentity: position.componentIdentity },
  }).queryKey;
  snapshotQuery(queryClient, querySnapshots, positionKey);
  const current = queryClient.getQueryData<{ savedAt?: string }>(positionKey);
  if (!(current?.savedAt && current.savedAt > position.savedAt)) {
    seededQueryKeys.push(positionKey);
    queryClient.setQueryData(positionKey, position);
    seededPositions.push({ queryKey: positionKey, savedAt: position.savedAt });
  }
  if (!position.semanticLocation) return;
  const historyKey = historyPositionKey(
    sourceId,
    stateId,
    position.componentIdentity,
  );
  if (
    !writeReadingHistoryPosition(
      historyKey,
      position.semanticLocation,
      position.savedAt,
    )
  )
    return;
  seededHistoryKeys.push(historyKey);
  const seeded = seededPositions.find(
    (item) =>
      item.savedAt === position.savedAt && item.queryKey === positionKey,
  );
  if (seeded) seeded.historyKey = historyKey;
  else seededPositions.push({ historyKey, savedAt: position.savedAt });
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
