import type { db } from "@lirna/db";
import {
  sepAdmissionOutcomes,
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
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { ActiveReadingDerivativeOperations } from "./active-reading-derivative";
import {
  parseStringList,
  sepObservationKeySchema,
} from "./sep-admission-builders";
import type {
  SepAdmittedStateOperations,
  SepLibrarySource,
} from "./sep-admitted-state";
import type { DatabaseExecutor } from "./sep-state-evidence";
import { readSepAdmittedState } from "./sep-state-projection";

export function createSepAdmittedStateReader(
  database: typeof db,
  activeReading: ActiveReadingDerivativeOperations,
): SepAdmittedStateOperations {
  return {
    async listSources(): Promise<SepLibrarySource[]> {
      const rows = await database
        .select({
          source: sources,
          state: sourceStates,
          metadata: sepSourceStateMetadata,
        })
        .from(sources)
        .leftJoin(sourceStates, eq(sourceStates.sourceId, sources.id))
        .leftJoin(
          sepSourceStateMetadata,
          eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
        )
        .orderBy(desc(sources.admittedAt), desc(sourceStates.sequence));
      return [...groupLibrarySources(rows).values()];
    },

    async deleteSource(sourceId: string): Promise<boolean> {
      return database.transaction(async (tx) => {
        const existing = await tx
          .select({ id: sources.id })
          .from(sources)
          .where(eq(sources.id, sourceId))
          .limit(1);
        if (existing.length === 0) return false;

        await tx.execute(
          sql`select set_config('lirna.allow_immutable_deletion', 'on', true)`,
        );
        await tx
          .delete(sepAdmissionOutcomes)
          .where(
            inArray(
              sepAdmissionOutcomes.sourceStateId,
              tx
                .select({ id: sourceStates.id })
                .from(sourceStates)
                .where(eq(sourceStates.sourceId, sourceId)),
            ),
          );

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

    getState: (sourceId, stateId) =>
      database.transaction(
        (tx) => readSepAdmittedState(tx, sourceId, stateId),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),

    async getReading(sourceId, stateId) {
      const active = await activeReading.read({ sourceId, stateId });
      return active.status === "active" ? active.value.reading : undefined;
    },

    async getUpdateTarget(sourceId: string) {
      const [row] = await database
        .select({
          stableKey: sources.stableKey,
          canonicalUrl: sourceStates.canonicalUrl,
        })
        .from(sources)
        .innerJoin(sourceStates, eq(sourceStates.sourceId, sources.id))
        .innerJoin(
          sepSourceStateMetadata,
          eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
        )
        .where(
          and(
            eq(sources.id, sourceId),
            eq(sourceStates.adapterId, "sep"),
            eq(sepSourceStateMetadata.observationKey, "submitted"),
          ),
        )
        .orderBy(desc(sourceStates.sequence))
        .limit(1);
      return row?.stableKey && row.canonicalUrl
        ? { stableKey: row.stableKey, canonicalUrl: row.canonicalUrl }
        : undefined;
    },
  };
}

export async function readSepLibrarySourceInSnapshot(
  database: DatabaseExecutor,
  sourceId: string,
) {
  const rows = await database
    .select({
      source: sources,
      state: sourceStates,
      metadata: sepSourceStateMetadata,
    })
    .from(sources)
    .innerJoin(sourceStates, eq(sourceStates.sourceId, sources.id))
    .innerJoin(
      sepSourceStateMetadata,
      eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
    )
    .where(and(eq(sources.id, sourceId), eq(sourceStates.adapterId, "sep")))
    .orderBy(desc(sourceStates.sequence));
  return groupLibrarySources(rows).get(sourceId);
}

interface LibraryRow {
  source: typeof sources.$inferSelect;
  state: typeof sourceStates.$inferSelect | null;
  metadata: typeof sepSourceStateMetadata.$inferSelect | null;
}

function groupLibrarySources(rows: LibraryRow[]) {
  const grouped = new Map<string, SepLibrarySource>();
  for (const row of rows) {
    if (row.state?.adapterId !== "sep" || !row.metadata) continue;
    const source = grouped.get(row.source.id) ?? librarySource(row);
    appendSepState(source, row);
    grouped.set(row.source.id, source);
  }
  return grouped;
}

function librarySource(row: LibraryRow): SepLibrarySource {
  return {
    id: row.source.id,
    title: row.source.title,
    admittedAt: row.source.admittedAt.toISOString(),
    authors: row.metadata ? parseStringList(row.metadata.authors) : [],
    publisher: row.metadata?.publisher ?? "",
    publicationHistory: row.metadata
      ? parseStringList(row.metadata.publicationHistory)
      : [],
    kind: "sep",
    ...(row.source.stableKey ? { stableKey: row.source.stableKey } : {}),
    states: [],
  };
}

function appendSepState(source: SepLibrarySource, row: LibraryRow) {
  if (!row.state) return;
  if (!row.metadata) return;
  source.states.push({
    id: row.state.id,
    sequence: row.state.sequence,
    observationKey: sepObservationKeySchema.parse(row.state.observationKey),
    canonicalUrl: row.state.canonicalUrl ?? "",
    title: row.metadata.title,
    publisher: row.metadata.publisher,
    admittedAt: row.state.admittedAt.toISOString(),
  });
  source.currentStateId ??= row.state.id;
}
