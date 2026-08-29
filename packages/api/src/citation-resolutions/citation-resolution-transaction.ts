import type { db } from "@lirna/db";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, eq } from "drizzle-orm";

import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/state/active-reading-derivative-store";
import type { DatabaseExecutor } from "../sep-admission/state/evidence";

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
          const [lockedState] = await tx
            .select({ id: sourceStates.id })
            .from(sourceStates)
            .where(
              and(
                eq(sourceStates.id, input.stateId),
                eq(sourceStates.sourceId, input.sourceId),
              ),
            )
            .for("update");
          return lockedState ? operation(tx) : undefined;
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
  let current = error;
  const seen = new Set<object>();
  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (
      "code" in current &&
      (current.code === "40001" || current.code === "40P01")
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
