import type { db } from "@lirna/db";

import { readCitationResolutionsInSnapshot } from "../citation-resolutions/citation-resolution-reader";
import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/active-reading-derivative-store";
import { readSepLibrarySourceInSnapshot } from "../sep-admission/sep-admitted-state-reader";
import { readSepAdmittedState } from "../sep-admission/sep-state-projection";
import type { ReadingWorkspaceOperations } from "./reading-workspace";

export function createReadingWorkspaceReader(
  database: typeof db,
  onSnapshotEstablished?: () => Promise<void>,
): ReadingWorkspaceOperations {
  return {
    read: (sourceId, stateId) =>
      database.transaction(
        async (tx) => {
          const active = await readActiveReadingDerivativeInSnapshot(tx, {
            sourceId,
            stateId,
          });
          if (active.status !== "active") return undefined;
          await onSnapshotEstablished?.();
          const state = await readSepAdmittedState(tx, sourceId, stateId);
          const source = await readSepLibrarySourceInSnapshot(tx, sourceId);
          const citationResolutions = await readCitationResolutionsInSnapshot(
            tx,
            sourceId,
            stateId,
          );
          return state && source
            ? {
                reading: active.value.reading,
                state,
                source,
                citationResolutions,
              }
            : undefined;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),
  };
}
