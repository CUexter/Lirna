import type { db } from "@lirna/db";

import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/state/active-reading-derivative-store";
import {
  type DatabaseExecutor,
  lockSourceState,
  postgresErrorChainMatches,
} from "../sep-admission/state/evidence";

export async function readActiveCitationDerivative(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
) {
  const active = await readActiveReadingDerivativeInSnapshot(database, {
    sourceId,
    stateId,
  });
  return active.status === "active"
    ? {
        derivativeId: active.value.derivativeId,
        reading: active.value.reading,
        rightsBasis: active.value.policy.rightsBasis,
        sensitivityLevel: active.value.policy.sensitivityLevel,
      }
    : undefined;
}

export async function runSerializedCitationWrite<T>(
  database: typeof db,
  input: { sourceId: string; stateId: string },
  operation: (database: DatabaseExecutor) => Promise<T>,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await database.transaction(
        async (tx) => {
          const locked = await lockSourceState(tx, input);
          return locked ? operation(tx) : undefined;
        },
        { isolationLevel: "serializable" },
      );
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Citation resolution write retry limit exceeded");
}

function isRetryableTransactionConflict(error: unknown) {
  return postgresErrorChainMatches(
    error,
    ({ code }) => code === "40001" || code === "40P01",
  );
}
