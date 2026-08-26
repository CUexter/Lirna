import { annotations } from "@lirna/db/schema/annotations";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import { sourceStateDerivatives } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";
import { activeReadingDerivative } from "../sep-admission/active-reading-derivative";
import { sepReadingDerivativeKind } from "../sep-admission/sep-reading-contract";
import {
  type DatabaseExecutor,
  readSepStateEvidence,
} from "../sep-admission/sep-state-evidence";
import type { AuthoredAnchor } from "./derivative-analysis";
import { projectAuthoredAnchors } from "./derivative-update-projection";

export type { DatabaseExecutor } from "../sep-admission/sep-state-evidence";

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
  const active = await activeReadingDerivative(database, stateId);
  return active
    ? { id: active.derivativeId, reading: active.reading }
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
