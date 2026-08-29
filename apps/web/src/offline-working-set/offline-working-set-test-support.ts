import {
  type AppShellCompatibility,
  persistedWorkingSetVersion,
} from "./app-shell-compatibility";
import type {
  OfflineWorkingSetTarget,
  ReadingProgressInput,
} from "./offline-working-set";
import {
  createMemoryOfflineWorkingSetLifecycle,
  type OfflineWorkingSetLifecycle,
} from "./offline-working-set-lifecycle";
import { createMemoryOfflineWorkingSetStorage } from "./offline-working-set-storage";
import {
  createOfflineWorkingSets,
  type OfflineSnapshot,
} from "./offline-working-set-store";

export function createMemoryOfflineWorkingSets(input: {
  fetchSnapshot(target: OfflineWorkingSetTarget): Promise<OfflineSnapshot>;
  fetchCurrentness?: (target: OfflineWorkingSetTarget) => Promise<{
    activationId?: string;
    currentStateId?: string;
  }>;
  now?: () => Date;
  inspectAppShell?: (
    persistedVersion: number,
  ) => Promise<AppShellCompatibility>;
  records?: Map<string, unknown>;
  lifecycle?: OfflineWorkingSetLifecycle;
  sourceExists?: (sourceId: string) => Promise<boolean>;
  savePosition?: (
    input: ReadingProgressInput & { savedAt?: string },
  ) => Promise<
    NonNullable<
      import("@/clients/inquiry").InquiryOutputs["sources"]["resume"]["get"]
    >
  >;
}) {
  const records = input.records ?? new Map<string, unknown>();
  const locks = new Map<string, Promise<void>>();
  return {
    records,
    workingSets: createOfflineWorkingSets({
      fetchSnapshot: input.fetchSnapshot,
      fetchCurrentness:
        input.fetchCurrentness ??
        (async () => ({
          activationId: "40000000-0000-4000-8000-000000000000",
          currentStateId: "20000000-0000-4000-8000-000000000000",
        })),
      now: input.now ?? (() => new Date("2026-08-26T12:00:00.000Z")),
      runExclusive: (target, operation) =>
        runMemoryExclusive(
          locks,
          `${target.sourceId}:${target.stateId}`,
          operation,
        ),
      savePosition:
        input.savePosition ??
        (async (position) => ({
          ...position,
          sourceTitle: "Synthetic Reading Source",
          savedAt: position.savedAt ?? "2026-08-26T12:00:00.000Z",
        })),
      inspectAppShell:
        input.inspectAppShell ??
        (async (persistedVersion) =>
          persistedVersion === persistedWorkingSetVersion
            ? {
                status: "compatible" as const,
                shellVersion: persistedWorkingSetVersion,
                persistedVersion,
              }
            : {
                status: "incompatible" as const,
                shellVersion: persistedWorkingSetVersion,
                persistedVersion,
                reason: `Application shell version ${persistedWorkingSetVersion} cannot read persisted Offline working-set version ${persistedVersion}.`,
              }),
      lifecycle: input.lifecycle ?? createMemoryOfflineWorkingSetLifecycle(),
      sourceExists: input.sourceExists ?? (async () => true),
      storage: createMemoryOfflineWorkingSetStorage(records),
      subscribeToCurrentness: () => () => undefined,
    }),
  };
}

function runMemoryExclusive<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
) {
  const prior = locks.get(key) ?? Promise.resolve();
  const result = prior.then(operation, operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, settled);
  void settled.finally(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return result;
}
