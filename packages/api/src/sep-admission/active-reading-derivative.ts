import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { and, desc, eq } from "drizzle-orm";

import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";
import type { DatabaseExecutor } from "./sep-state-evidence";

export async function activeReadingDerivative(
  database: DatabaseExecutor,
  stateId: string,
  sourceId?: string,
) {
  const [row] = await database
    .select({
      derivativeId: sourceStateDerivatives.id,
      payload: sourceStateDerivatives.payload,
      rightsBasis: sourceStates.rightsBasis,
      sensitivityLevel: sourceStates.sensitivityLevel,
      source: sources,
    })
    .from(sourceStateDerivativeActivations)
    .innerJoin(
      sourceStateDerivatives,
      eq(
        sourceStateDerivatives.id,
        sourceStateDerivativeActivations.derivativeId,
      ),
    )
    .innerJoin(
      sourceStates,
      eq(sourceStates.id, sourceStateDerivativeActivations.sourceStateId),
    )
    .innerJoin(sources, eq(sources.id, sourceStates.sourceId))
    .where(
      and(
        eq(sourceStates.id, stateId),
        ...(sourceId ? [eq(sourceStates.sourceId, sourceId)] : []),
        eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
        eq(sourceStateDerivatives.sourceStateId, stateId),
        eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
        eq(sourceStateDerivatives.valid, true),
      ),
    )
    .orderBy(
      desc(sourceStateDerivativeActivations.activatedAt),
      desc(sourceStateDerivativeActivations.id),
    )
    .limit(1);
  return row
    ? { ...row, reading: readSepReadingDerivative(row.payload) }
    : undefined;
}
