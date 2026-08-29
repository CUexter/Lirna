import { annotations } from "@lirna/db/schema/annotations";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import { asc, eq } from "drizzle-orm";
import { readCitationResolutionsInSnapshot } from "../../citation-resolutions/citation-resolution-reader";
import { projectAuthoredAnchors } from "../../derivative-updates/derivative-update-projection";
import type { DatabaseExecutor } from "./evidence";

export async function readAuthoredAnchors(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
) {
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
    readCitationResolutionsInSnapshot(database, sourceId, stateId),
  ]);
  return projectAuthoredAnchors(annotationRows, positionRows, resolutionRows);
}

export function isRetryableActivationConflict(error: unknown) {
  let current = error;
  const seen = new Set<object>();
  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (
      ("code" in current && current.code === "40001") ||
      ("code" in current &&
        current.code === "23505" &&
        "constraint" in current &&
        current.constraint ===
          "source_state_derivative_activations_sequence_uidx")
    )
      return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
