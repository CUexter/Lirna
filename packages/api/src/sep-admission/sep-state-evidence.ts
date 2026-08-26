import type { db } from "@lirna/db";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import { sourceStateResources, sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

export type DatabaseExecutor =
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]
  | typeof db;

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
