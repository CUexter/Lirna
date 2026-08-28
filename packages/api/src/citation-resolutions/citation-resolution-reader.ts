import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../sep-admission/sep-state-evidence";
import type {
  CitationResolutionDecision,
  CitationResolutionRecord,
} from "./citation-resolution-contract";

export async function readCitationResolutionsInSnapshot(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
) {
  const decisions = await readCitationResolutionHistoryInSnapshot(
    database,
    sourceId,
    stateId,
  );
  const latest = new Map<string, CitationResolutionDecision>();
  for (const decision of decisions) latest.set(decisionKey(decision), decision);
  return [...latest.values()]
    .flatMap((decision) => {
      const selected = selectedCitationResolution(decision);
      return selected ? [selected] : [];
    })
    .toSorted(
      (left, right) =>
        left.componentIdentity.localeCompare(right.componentIdentity) ||
        left.mentionId.localeCompare(right.mentionId),
    );
}

export async function readCitationResolutionHistoryInSnapshot(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
) {
  const rows = await database
    .select({
      resolution: citationResolutions,
      sourceId: sourceStates.sourceId,
    })
    .from(citationResolutions)
    .innerJoin(
      sourceStates,
      eq(sourceStates.id, citationResolutions.sourceStateId),
    )
    .where(
      and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
    )
    .orderBy(asc(citationResolutions.createdAt), asc(citationResolutions.id));
  return rows.map(({ resolution, sourceId: ownerSourceId }) =>
    serializeCitationResolutionDecision(resolution, ownerSourceId),
  );
}

function serializeCitationResolutionDecision(
  resolution: typeof citationResolutions.$inferSelect,
  sourceId: string,
): CitationResolutionDecision {
  return {
    ...resolution,
    sourceId,
    action: resolution.action as CitationResolutionDecision["action"],
    offsetBasis:
      resolution.offsetBasis as CitationResolutionDecision["offsetBasis"],
    method: resolution.method as CitationResolutionDecision["method"],
    createdAt: resolution.createdAt.toISOString(),
    updatedAt: resolution.updatedAt.toISOString(),
  };
}

function selectedCitationResolution(
  decision: CitationResolutionDecision,
): CitationResolutionRecord | undefined {
  if (
    decision.action !== "selected" ||
    decision.bibliographyComponentIdentity === null ||
    decision.bibliographyEntryId === null
  ) {
    return undefined;
  }
  const { action: _action, ...record } = decision;
  return {
    ...record,
    bibliographyComponentIdentity: decision.bibliographyComponentIdentity,
    bibliographyEntryId: decision.bibliographyEntryId,
  };
}

function decisionKey(decision: CitationResolutionDecision) {
  return `${decision.componentIdentity}\u0000${decision.mentionId}`;
}
