import { db } from "@lirna/db";
import {
  sepAdmissionPreviews,
  sepSourceStateMetadata,
} from "@lirna/db/schema/sep-admission";
import {
  sourceRelations,
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  parseStringList,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./sep-admission-builders";
import type {
  SepAdmittedState,
  SepAdmittedStateOperations,
  SepLibrarySource,
} from "./sep-admitted-state";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";

export function createSepAdmittedStateReader(
  database: typeof db = db,
): SepAdmittedStateOperations {
  return {
    async listSources(): Promise<SepLibrarySource[]> {
      const rows = await database
        .select({ source: sources, state: sourceStates })
        .from(sources)
        .innerJoin(sourceStates, eq(sourceStates.sourceId, sources.id))
        .where(eq(sourceStates.adapterId, "sep"))
        .orderBy(desc(sources.admittedAt), desc(sourceStates.sequence));
      const grouped = new Map<string, SepLibrarySource>();
      for (const row of rows) {
        const source = grouped.get(row.source.id) ?? {
          id: row.source.id,
          title: row.source.title,
          admittedAt: row.source.admittedAt.toISOString(),
          states: [],
        };
        source.states.push({
          id: row.state.id,
          sequence: row.state.sequence,
          observationKey: sepObservationKeySchema.parse(
            row.state.observationKey,
          ),
          canonicalUrl: row.state.canonicalUrl ?? "",
          admittedAt: row.state.admittedAt.toISOString(),
        });
        grouped.set(row.source.id, source);
      }
      return [...grouped.values()];
    },

    async deleteSource(sourceId: string): Promise<boolean> {
      return database.transaction(async (tx) => {
        const existing = await tx
          .select({ id: sources.id })
          .from(sources)
          .where(eq(sources.id, sourceId))
          .limit(1);
        if (existing.length === 0) return false;

        await tx
          .update(sepAdmissionPreviews)
          .set({ replacesSourceId: null })
          .where(eq(sepAdmissionPreviews.replacesSourceId, sourceId));
        await tx
          .delete(sourceRelations)
          .where(
            or(
              eq(sourceRelations.sourceId, sourceId),
              eq(sourceRelations.relatedSourceId, sourceId),
            ),
          );
        await tx
          .delete(sourceStateDerivativeActivations)
          .where(
            inArray(
              sourceStateDerivativeActivations.sourceStateId,
              tx
                .select({ id: sourceStates.id })
                .from(sourceStates)
                .where(eq(sourceStates.sourceId, sourceId)),
            ),
          );
        await tx
          .delete(sourceStateDerivatives)
          .where(
            inArray(
              sourceStateDerivatives.sourceStateId,
              tx
                .select({ id: sourceStates.id })
                .from(sourceStates)
                .where(eq(sourceStates.sourceId, sourceId)),
            ),
          );
        await tx
          .delete(sepSourceStateMetadata)
          .where(
            inArray(
              sepSourceStateMetadata.sourceStateId,
              tx
                .select({ id: sourceStates.id })
                .from(sourceStates)
                .where(eq(sourceStates.sourceId, sourceId)),
            ),
          );
        await tx
          .delete(sourceStateResources)
          .where(
            inArray(
              sourceStateResources.sourceStateId,
              tx
                .select({ id: sourceStates.id })
                .from(sourceStates)
                .where(eq(sourceStates.sourceId, sourceId)),
            ),
          );
        await tx
          .delete(sourceStates)
          .where(eq(sourceStates.sourceId, sourceId));
        await tx.delete(sources).where(eq(sources.id, sourceId));
        return true;
      });
    },

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
        authors: parseStringList(row.metadata.authors),
        publisher: row.metadata.publisher,
        publicationHistory: parseStringList(row.metadata.publicationHistory),
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

export const sepAdmittedStateOperations = createSepAdmittedStateReader();
