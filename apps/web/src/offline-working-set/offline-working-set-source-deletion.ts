import type { OfflineWorkingSetLifecycle } from "./offline-working-set-lifecycle";
import {
  sourceDeletionKey,
  targetFromWorkingSetKey,
} from "./offline-working-set-persistence";
import type { OfflineWorkingSetStorage } from "./offline-working-set-storage";

type SourceDeletionMarker = {
  kind: "source-deletion";
  sourceId: string;
  status: "requested" | "confirmed";
  requestedAt: string;
};

export function createOfflineWorkingSetSourceDeletion(input: {
  storage: OfflineWorkingSetStorage;
  lifecycle: OfflineWorkingSetLifecycle;
  now(): Date;
  sourceExists(sourceId: string): Promise<boolean>;
}) {
  async function removeSource(sourceId: string) {
    const deleted = await input.storage.deleteMatching(
      (id) => targetFromWorkingSetKey(id)?.sourceId === sourceId,
    );
    if (deleted.length > 0) input.lifecycle.publish({ sourceId });
    return deleted;
  }

  return {
    async recover() {
      const entries = await input.storage.entries();
      for (const [id, value] of entries) {
        const marker = sourceDeletionMarker(id, value);
        if (!marker) continue;
        if (marker.status === "requested") {
          let exists: boolean;
          try {
            exists = await input.sourceExists(marker.sourceId);
          } catch {
            continue;
          }
          if (exists) continue;
          await input.storage.put(id, { ...marker, status: "confirmed" });
        }
        await removeSource(marker.sourceId);
      }
    },
    removeSource: async (sourceId: string) =>
      (await removeSource(sourceId)).length,
    async reconcile<T>(sourceId: string, deleteSource: () => Promise<T>) {
      const marker: SourceDeletionMarker = {
        kind: "source-deletion",
        sourceId,
        status: "requested",
        requestedAt: input.now().toISOString(),
      };
      await input.storage.put(sourceDeletionKey(sourceId), marker);
      input.lifecycle.publish({ sourceId });
      const result = await deleteSource();
      await input.storage.put(sourceDeletionKey(sourceId), {
        ...marker,
        status: "confirmed",
      });
      await removeSource(sourceId);
      return result;
    },
  };
}

export function isSourceDeletionMarker(id: string, value: unknown) {
  return sourceDeletionMarker(id, value) !== undefined;
}

function sourceDeletionMarker(
  id: string,
  value: unknown,
): SourceDeletionMarker | undefined {
  if (!(value && typeof value === "object")) return undefined;
  const marker = value as Partial<SourceDeletionMarker>;
  if (
    id !== sourceDeletionKey(marker.sourceId ?? "") ||
    marker.kind !== "source-deletion" ||
    !["requested", "confirmed"].includes(marker.status ?? "") ||
    typeof marker.requestedAt !== "string"
  )
    return undefined;
  return marker as SourceDeletionMarker;
}
