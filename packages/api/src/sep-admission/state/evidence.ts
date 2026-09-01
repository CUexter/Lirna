import type { db } from "@lirna/db";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import { sourceStateResources, sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

export type DatabaseExecutor =
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]
  | typeof db;

export async function lockSourceState(
  database: DatabaseExecutor,
  input: { sourceId: string; stateId: string },
) {
  return sourceStateExists(database, input, true);
}

export async function sourceStateExists(
  database: DatabaseExecutor,
  input: { sourceId: string; stateId: string },
  lock = false,
) {
  const query = database
    .select({ id: sourceStates.id })
    .from(sourceStates)
    .where(
      and(
        eq(sourceStates.id, input.stateId),
        eq(sourceStates.sourceId, input.sourceId),
      ),
    );
  const [state] = lock ? await query.for("update") : await query;
  return Boolean(state);
}

type PostgresErrorDetails = { code?: unknown; constraint?: unknown };

export function postgresErrorChainMatches(
  error: unknown,
  predicate: (details: PostgresErrorDetails) => boolean,
) {
  let current = error;
  const seen = new Set<object>();
  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (predicate(current)) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function readSepStateEvidence(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
  resourceOrder: "identity" | "role",
) {
  const [row] = await database
    .select({ state: sourceStates, metadata: sepSourceStateMetadata })
    .from(sourceStates)
    .innerJoin(
      sepSourceStateMetadata,
      eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
    )
    .where(
      and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
    );
  if (!row) return undefined;
  const resourcesQuery = database
    .select()
    .from(sourceStateResources)
    .where(eq(sourceStateResources.sourceStateId, stateId));
  const resources =
    resourceOrder === "role"
      ? await resourcesQuery.orderBy(
          asc(sourceStateResources.role),
          asc(sourceStateResources.identity),
        )
      : await resourcesQuery.orderBy(asc(sourceStateResources.identity));
  return { ...row, resources };
}
