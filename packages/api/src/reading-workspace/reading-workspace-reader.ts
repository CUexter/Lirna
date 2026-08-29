import type { db } from "@lirna/db";

import { readCitationResolutionsInSnapshot } from "../citation-resolutions/citation-resolution-reader";
import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/active-reading-derivative-store";
import { readSepLibrarySourceInSnapshot } from "../sep-admission/sep-admitted-state-reader";
import type { SepReadingContract } from "../sep-admission/sep-reading-contract";
import type { DatabaseExecutor } from "../sep-admission/sep-state-evidence";
import { readSepAdmittedState } from "../sep-admission/sep-state-projection";
import type {
  ReadingWorkspaceOperations,
  ReadingWorkspaceProjection,
} from "./reading-workspace";

export async function readReadingWorkspaceInSnapshot(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
  reading: SepReadingContract,
): Promise<ReadingWorkspaceProjection | undefined> {
  const state = await readSepAdmittedState(database, sourceId, stateId);
  const source = await readSepLibrarySourceInSnapshot(database, sourceId);
  const citationResolutions = await readCitationResolutionsInSnapshot(
    database,
    sourceId,
    stateId,
  );
  return state && source
    ? { reading, state, source, citationResolutions }
    : undefined;
}

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
          return readReadingWorkspaceInSnapshot(
            tx,
            sourceId,
            stateId,
            active.value.reading,
          );
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),
  };
}
