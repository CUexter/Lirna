import { db } from "@lirna/db";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { SepAdmittedState, SepAdmittedStateReader } from "./sep-admission";
import {
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./sep-admission-builders";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";

export function createSepAdmittedStateReader(
  database: typeof db = db,
): SepAdmittedStateReader {
  return {
    async getState(
      sourceId: string,
      stateId: string,
    ): Promise<SepAdmittedState | undefined> {
      const [row] = await database
        .select({ state: sourceStates, metadata: sepSourceStateMetadata })
        .from(sourceStates)
        .innerJoin(
          sepSourceStateMetadata,
          eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
        )
        .where(
          and(
            eq(sourceStates.id, stateId),
            eq(sourceStates.sourceId, sourceId),
          ),
        );
      if (!row) return undefined;
      const resources = await database
        .select()
        .from(sourceStateResources)
        .where(eq(sourceStateResources.sourceStateId, stateId))
        .orderBy(
          asc(sourceStateResources.role),
          asc(sourceStateResources.identity),
        );
      return {
        id: row.state.id,
        sourceId: row.state.sourceId,
        sequence: row.state.sequence,
        observationKey: sepObservationKeySchema.parse(row.state.observationKey),
        canonicalUrl: row.state.canonicalUrl ?? "",
        title: row.metadata.title,
        authors: z.array(z.string()).parse(row.metadata.authors),
        publisher: row.metadata.publisher,
        publicationHistory: z
          .array(z.string())
          .parse(row.metadata.publicationHistory),
        admittedAt: row.state.admittedAt.toISOString(),
        resources: resources.map((resource) => ({
          role: sepResourceRoleSchema.parse(resource.role),
          requestedUrl: resource.requestedUrl,
          finalUrl: resource.finalUrl,
          mediaType: resource.mediaType,
          byteLength: resource.byteLength,
          sha256: resource.sha256,
          discoveryEdge: resource.discoveryEdge,
        })),
      };
    },

    async getReading(sourceId: string, stateId: string) {
      const [row] = await database
        .select({ payload: sourceStateDerivatives.payload })
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
        .where(
          and(
            eq(sourceStates.id, stateId),
            eq(sourceStates.sourceId, sourceId),
            eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
          ),
        )
        .orderBy(desc(sourceStateDerivativeActivations.activatedAt))
        .limit(1);
      return row ? readSepReadingDerivative(row.payload) : undefined;
    },
  };
}
