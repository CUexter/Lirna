import { sourceStateDerivatives, sourceStates } from "@lirna/db/schema/sources";
import { and, eq } from "drizzle-orm";
import { sepReadingDerivativeKind } from "../sep-admission/reading/contract";
import { readAuthoredAnchors } from "../sep-admission/state/active-reading-derivative-queries";
import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/state/active-reading-derivative-store";
import {
  type DatabaseExecutor,
  readSepStateEvidence,
} from "../sep-admission/state/evidence";

export type { DatabaseExecutor } from "../sep-admission/state/evidence";

export async function derivativeEvidence(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
) {
  return readSepStateEvidence(database, sourceId, stateId, "identity");
}

export async function derivativeCount(
  database: DatabaseExecutor,
  stateId: string,
) {
  const rows = await database
    .select({ id: sourceStateDerivatives.id })
    .from(sourceStateDerivatives)
    .where(
      and(
        eq(sourceStateDerivatives.sourceStateId, stateId),
        eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
      ),
    );
  return rows.length;
}

export async function activeDerivative(
  database: DatabaseExecutor,
  stateId: string,
) {
  const [state] = await database
    .select({ sourceId: sourceStates.sourceId })
    .from(sourceStates)
    .where(eq(sourceStates.id, stateId));
  if (!state) return undefined;
  const active = await readActiveReadingDerivativeInSnapshot(database, {
    sourceId: state.sourceId,
    stateId,
  });
  return active.status === "active"
    ? { id: active.value.derivativeId, reading: active.value.reading }
    : undefined;
}

export { readAuthoredAnchors as authoredAnchors };
