import type {
  OfflineWorkingSets,
  OfflineWorkingSetTarget,
  ReadingProgressInput,
  ReadingProgressSaveResult,
  RetainedReadingWorkspace,
} from "./offline-working-set";
import {
  type OfflineWorkingSetRecord,
  refreshReplicaIntegrity,
  targetFromWorkingSetKey,
  workingSetKey,
} from "./offline-working-set-persistence";

type RetainedPosition = Extract<
  RetainedReadingWorkspace,
  { status: "available" }
>["positions"][number];

interface ProgressDependencies {
  entries(): Promise<Array<[string, unknown]>>;
  now(): Date;
  persist(key: string, record: OfflineWorkingSetRecord): Promise<boolean>;
  publish(target: OfflineWorkingSetTarget): void;
  runExclusive<T>(
    target: OfflineWorkingSetTarget,
    operation: () => Promise<T>,
  ): Promise<T>;
  read(
    target: OfflineWorkingSetTarget,
  ): Promise<OfflineWorkingSetRecord | undefined>;
  savePosition(
    input: ReadingProgressInput & { savedAt?: string },
  ): Promise<RetainedPosition>;
}

export function createOfflineReadingProgress({
  entries,
  now,
  persist,
  publish,
  read,
  runExclusive,
  savePosition,
}: ProgressDependencies): Pick<
  OfflineWorkingSets,
  "saveProgress" | "retryProgress" | "synchronizeProgress"
> {
  async function synchronizeTargetNow(target: OfflineWorkingSetTarget) {
    const record = await read(target);
    if (!record) return;
    for (const pending of record.pendingProgress ?? [])
      await synchronizePosition(target, pending.position);
  }

  async function synchronizePosition(
    target: OfflineWorkingSetTarget,
    attempted: RetainedPosition,
  ) {
    try {
      const server = await savePosition({
        sourceId: attempted.sourceId,
        stateId: attempted.stateId,
        componentIdentity: attempted.componentIdentity,
        componentLabel: attempted.componentLabel,
        scrollTop: attempted.scrollTop,
        ...(attempted.semanticLocation
          ? { semanticLocation: attempted.semanticLocation }
          : {}),
        savedAt: attempted.savedAt,
      });
      await runExclusive(target, async () => {
        const current = await read(target);
        if (!current || pendingChanged(current, attempted)) return;
        const synchronized = await refreshReplicaIntegrity({
          ...current,
          replica: {
            ...current.replica,
            positions: upsertPosition(current.replica.positions, server),
          },
          pendingProgress: current.pendingProgress?.filter(
            ({ position }) =>
              position.componentIdentity !== attempted.componentIdentity,
          ),
        });
        if (await persist(workingSetKey(target), synchronized)) publish(target);
      });
    } catch (error) {
      await runExclusive(target, async () => {
        const current = await read(target);
        if (!current) return;
        const pendingProgress = current.pendingProgress?.map((pending) =>
          pending.position.componentIdentity === attempted.componentIdentity &&
          pending.position.savedAt === attempted.savedAt
            ? {
                ...pending,
                synchronization: "failed" as const,
                message: errorMessage(error),
              }
            : pending,
        );
        if (
          pendingProgress &&
          (await persist(workingSetKey(target), {
            ...current,
            pendingProgress,
          }))
        )
          publish(target);
      });
    }
  }

  return {
    saveProgress(input): Promise<ReadingProgressSaveResult> {
      const target = { sourceId: input.sourceId, stateId: input.stateId };
      return (async () => {
        const position = await runExclusive(target, async () => {
          const record = await read(target);
          if (!record) return undefined;
          const position = localPosition(input, record, now());
          const pendingRecord = await refreshReplicaIntegrity({
            ...record,
            replica: {
              ...record.replica,
              positions: upsertPosition(record.replica.positions, position),
            },
            pendingProgress: upsertPending(record.pendingProgress, position),
          });
          if (!(await persist(workingSetKey(target), pendingRecord)))
            throw new Error(
              "Offline progress cannot be saved while Source deletion is pending",
            );
          publish(target);
          return position;
        });
        if (!position)
          return {
            status: "synchronized",
            position: await savePosition(input),
          };
        await synchronizeTargetNow(target);
        return saveResult(await read(target), position);
      })();
    },
    retryProgress: synchronizeTargetNow,
    async synchronizeProgress() {
      const targets = (await entries())
        .map(([id]) => targetFromWorkingSetKey(id))
        .filter((target): target is OfflineWorkingSetTarget => Boolean(target));
      await Promise.all(targets.map(synchronizeTargetNow));
    },
  };
}

export async function mergePendingProgress(
  record: OfflineWorkingSetRecord,
  prior: OfflineWorkingSetRecord | undefined,
) {
  if (!prior) return record;
  const pendingProgress = prior.pendingProgress?.filter(({ position }) => {
    const server = record.replica.positions.find(
      (candidate) => candidate.componentIdentity === position.componentIdentity,
    );
    return !server || server.savedAt < position.savedAt;
  });
  let positions = record.replica.positions;
  for (const position of prior.replica.positions) {
    const retained = positions.find(
      (candidate) => candidate.componentIdentity === position.componentIdentity,
    );
    if (!retained || retained.savedAt < position.savedAt)
      positions = upsertPosition(positions, position);
  }
  for (const pending of pendingProgress ?? [])
    positions = upsertPosition(positions, pending.position);
  if (positions === record.replica.positions && !pendingProgress?.length)
    return record;
  return refreshReplicaIntegrity({
    ...record,
    replica: { ...record.replica, positions },
    pendingProgress,
  });
}

export function progressSynchronization(
  record: OfflineWorkingSetRecord,
): "synchronized" | "pending" | "failed" {
  if (record.pendingProgress?.some((item) => item.synchronization === "failed"))
    return "failed";
  return record.pendingProgress?.length ? "pending" : "synchronized";
}

function localPosition(
  input: ReadingProgressInput,
  record: OfflineWorkingSetRecord,
  savedAt: Date,
): RetainedPosition {
  const priorSavedAt = record.replica.positions.find(
    (position) => position.componentIdentity === input.componentIdentity,
  )?.savedAt;
  const timestamp = Math.max(
    savedAt.getTime(),
    priorSavedAt ? new Date(priorSavedAt).getTime() + 1 : 0,
  );
  return {
    sourceId: input.sourceId,
    stateId: input.stateId,
    sourceTitle: record.replica.workspace.source.title,
    componentIdentity: input.componentIdentity,
    componentLabel: input.componentLabel,
    scrollTop: input.scrollTop,
    ...(input.semanticLocation
      ? { semanticLocation: input.semanticLocation }
      : {}),
    savedAt: new Date(timestamp).toISOString(),
  };
}

function saveResult(
  record: OfflineWorkingSetRecord | undefined,
  fallback: RetainedPosition,
): ReadingProgressSaveResult {
  const pending = record?.pendingProgress?.find(
    (item) => item.position.componentIdentity === fallback.componentIdentity,
  );
  if (pending)
    return {
      status: "pending",
      position: pending.position,
      message:
        pending.message ??
        "Reading progress is saved locally and will retry after reconnect.",
    };
  const saved = record?.replica.positions.find(
    (item) => item.componentIdentity === fallback.componentIdentity,
  );
  return { status: "synchronized", position: saved ?? fallback };
}

function pendingChanged(
  record: OfflineWorkingSetRecord,
  attempted: RetainedPosition,
) {
  return (
    record.pendingProgress?.find(
      ({ position }) =>
        position.componentIdentity === attempted.componentIdentity,
    )?.position.savedAt !== attempted.savedAt
  );
}

function upsertPosition(
  positions: RetainedPosition[],
  position: RetainedPosition,
) {
  return [
    ...positions.filter(
      (candidate) => candidate.componentIdentity !== position.componentIdentity,
    ),
    position,
  ].sort((left, right) =>
    left.componentIdentity.localeCompare(right.componentIdentity),
  );
}

function upsertPending(
  pending: OfflineWorkingSetRecord["pendingProgress"],
  position: RetainedPosition,
) {
  return [
    ...(pending ?? []).filter(
      (candidate) =>
        candidate.position.componentIdentity !== position.componentIdentity,
    ),
    { position, synchronization: "pending" as const },
  ];
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Progress synchronization failed";
}
