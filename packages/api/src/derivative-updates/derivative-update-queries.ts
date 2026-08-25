import type { db } from "@lirna/db";
import { annotations } from "@lirna/db/schema/annotations";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "../sep-admission/sep-reading-contract";
import type { AuthoredAnchor } from "./derivative-analysis";
import { projectAuthoredAnchors } from "./derivative-update-projection";

type DerivativeTransaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];
export type DatabaseExecutor = typeof db | DerivativeTransaction;

export async function derivativeEvidence(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
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
  const resources = await database
    .select()
    .from(sourceStateResources)
    .where(eq(sourceStateResources.sourceStateId, stateId))
    .orderBy(asc(sourceStateResources.identity));
  return { ...row, resources };
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
  const [row] = await database
    .select({
      id: sourceStateDerivatives.id,
      payload: sourceStateDerivatives.payload,
    })
    .from(sourceStateDerivativeActivations)
    .innerJoin(
      sourceStateDerivatives,
      eq(
        sourceStateDerivatives.id,
        sourceStateDerivativeActivations.derivativeId,
      ),
    )
    .where(
      and(
        eq(sourceStateDerivativeActivations.sourceStateId, stateId),
        eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
        eq(sourceStateDerivatives.valid, true),
      ),
    )
    .orderBy(
      desc(sourceStateDerivativeActivations.activatedAt),
      desc(sourceStateDerivativeActivations.id),
    )
    .limit(1);
  return row
    ? { id: row.id, reading: readSepReadingDerivative(row.payload) }
    : undefined;
}

export async function authoredAnchors(
  database: DatabaseExecutor,
  stateId: string,
): Promise<AuthoredAnchor[]> {
  const [annotationRows, positionRows, resolutionRows] = await Promise.all([
    database
      .select()
      .from(annotations)
      .where(eq(annotations.sourceStateId, stateId))
      .orderBy(asc(annotations.id)),
    database
      .select()
      .from(readingPositions)
      .where(eq(readingPositions.sourceStateId, stateId))
      .orderBy(asc(readingPositions.componentIdentity)),
    database
      .select()
      .from(citationResolutions)
      .where(eq(citationResolutions.sourceStateId, stateId))
      .orderBy(asc(citationResolutions.createdAt), asc(citationResolutions.id)),
  ]);
  return projectAuthoredAnchors(annotationRows, positionRows, resolutionRows);
}
