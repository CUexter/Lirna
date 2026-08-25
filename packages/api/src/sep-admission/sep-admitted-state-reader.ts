import { db } from "@lirna/db";
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
import {
  parseStringList,
  sepObservationKeySchema,
} from "./sep-admission-builders";
import type {
  SepAdmittedStateOperations,
  SepLibrarySource,
} from "./sep-admitted-state";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";
import { readSepAdmittedState } from "./sep-state-projection";

export function createSepAdmittedStateReader(
  database: typeof db = db,
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
      const relations = await database
        .select({
          legacySourceId: sourceRelations.relatedSourceId,
          replacementId: sources.id,
          replacementTitle: sources.title,
        })
        .from(sourceRelations)
        .innerJoin(sources, eq(sources.id, sourceRelations.sourceId))
        .where(eq(sourceRelations.kind, "replacement-capture-for"));
      const grouped = groupLibrarySources(rows);
      applyReplacementRelations(grouped, relations);
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
      readSepAdmittedState(database, sourceId, stateId),

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

export const sepAdmittedStateOperations = createSepAdmittedStateReader();

interface LibraryRow {
  source: typeof sources.$inferSelect;
  state: typeof sourceStates.$inferSelect | null;
  metadata: typeof sepSourceStateMetadata.$inferSelect | null;
}

function groupLibrarySources(rows: LibraryRow[]) {
  const grouped = new Map<string, SepLibrarySource>();
  for (const row of rows) {
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
    kind: row.state?.adapterId === "sep" ? "sep" : "legacy-sep-text",
    ...(row.source.stableKey ? { stableKey: row.source.stableKey } : {}),
    states: [],
  };
}

function appendSepState(source: SepLibrarySource, row: LibraryRow) {
  if (!row.state) return;
  if (row.state.adapterId !== "sep") {
    source.states.push({
      id: row.state.id,
      sequence: row.state.sequence,
      observationKey: "submitted",
      canonicalUrl: row.state.canonicalUrl ?? "",
      title: row.source.title,
      publisher: "",
      admittedAt: row.state.admittedAt.toISOString(),
    });
    source.currentStateId ??= row.state.id;
    return;
  }
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

function applyReplacementRelations(
  grouped: Map<string, SepLibrarySource>,
  relations: Array<{
    legacySourceId: string;
    replacementId: string;
    replacementTitle: string;
  }>,
) {
  for (const relation of relations) {
    const legacy = grouped.get(relation.legacySourceId);
    const replacement = grouped.get(relation.replacementId);
    if (!legacy || !replacement?.currentStateId) continue;
    legacy.replacement = {
      id: relation.replacementId,
      title: relation.replacementTitle,
      currentStateId: replacement.currentStateId,
    };
  }
}
