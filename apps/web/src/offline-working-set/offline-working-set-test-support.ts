import type { OfflineWorkingSetTarget } from "./offline-working-set";
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
  records?: Map<string, unknown>;
}) {
  const records = input.records ?? new Map<string, unknown>();
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
      storage: createMemoryOfflineWorkingSetStorage(records),
      subscribeToCurrentness: () => () => undefined,
    }),
  };
}
