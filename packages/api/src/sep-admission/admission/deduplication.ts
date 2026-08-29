import {
  sepAdmissionOutcomes,
  type sepPreviewResources,
  sepSourceStateMetadata,
} from "@lirna/db/schema/sep-admission";
import { sourceStateResources, sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { SepAdmissionError, type SepObservationKey } from "../capture/client";
import type { SepAdmissionTransaction } from "./preview-store";

export async function readAdmissionOutcome(
  tx: SepAdmissionTransaction,
  previewId: string,
  selectedKeys: readonly SepObservationKey[],
) {
  const existing = await tx
    .select({
      sourceStateId: sepAdmissionOutcomes.sourceStateId,
      observationKey: sepAdmissionOutcomes.observationKey,
      disposition: sepAdmissionOutcomes.disposition,
      sourceId: sourceStates.sourceId,
    })
    .from(sepAdmissionOutcomes)
    .innerJoin(
      sourceStates,
      eq(sourceStates.id, sepAdmissionOutcomes.sourceStateId),
    )
    .where(eq(sepAdmissionOutcomes.admissionPreviewId, previewId))
    .orderBy(asc(sourceStates.sequence));
  if (existing.length === 0) return undefined;
  if (
    existing
      .map(({ observationKey }) => observationKey)
      .sort()
      .join() !== [...selectedKeys].sort().join()
  ) {
    throw new SepAdmissionError(
      "This preview was already admitted with a different observation selection",
    );
  }
  const outcomes = selectedKeys.map((observationKey) => {
    const outcome = existing.find(
      (item) => item.observationKey === observationKey,
    );
    if (!outcome) throw new Error("Admission outcome is incomplete");
    return {
      observationKey,
      stateId: outcome.sourceStateId,
      disposition: z.enum(["created", "unchanged"]).parse(outcome.disposition),
    };
  });
  return {
    sourceId: existing[0]?.sourceId as string,
    stateIds: outcomes.map(({ stateId }) => stateId),
    outcomes,
  };
}

export async function findUnchangedStates(
  tx: SepAdmissionTransaction,
  sourceId: string,
  observationKeys: readonly SepObservationKey[],
  previewResources: Array<typeof sepPreviewResources.$inferSelect>,
) {
  const states = await tx
    .select({
      id: sourceStates.id,
      observationKey: sepSourceStateMetadata.observationKey,
    })
    .from(sourceStates)
    .innerJoin(
      sepSourceStateMetadata,
      eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
    )
    .where(
      and(
        eq(sourceStates.sourceId, sourceId),
        inArray(sepSourceStateMetadata.observationKey, [...observationKeys]),
      ),
    );
  if (states.length === 0) return new Map<SepObservationKey, string>();
  const resources = await tx
    .select({
      sourceStateId: sourceStateResources.sourceStateId,
      identity: sourceStateResources.identity,
      sha256: sourceStateResources.sha256,
      byteLength: sourceStateResources.byteLength,
    })
    .from(sourceStateResources)
    .where(
      inArray(
        sourceStateResources.sourceStateId,
        states.map(({ id }) => id),
      ),
    );
  const unchanged = new Map<SepObservationKey, string>();
  for (const key of observationKeys) {
    const observed = resourcesForState(previewResources, key);
    const matching = states.find((state) => {
      if (state.observationKey !== key) return false;
      const existing = resources.filter(
        (resource) => resource.sourceStateId === state.id,
      );
      return (
        existing.length === observed.length &&
        observed.every((resource) =>
          existing.some(
            (candidate) =>
              candidate.identity === resource.identity &&
              candidate.sha256 === resource.sha256 &&
              candidate.byteLength === resource.byteLength,
          ),
        )
      );
    });
    if (matching) unchanged.set(key, matching.id);
  }
  return unchanged;
}

export function resourcesForState(
  resources: Array<typeof sepPreviewResources.$inferSelect>,
  observationKey: string | null,
) {
  return resources.filter(
    (resource) => resource.observationKey === observationKey,
  );
}
