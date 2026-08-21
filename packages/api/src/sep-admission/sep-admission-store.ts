import { randomUUID } from "node:crypto";
import { db } from "@lirna/db";
import {
  sepPreviewResources,
  sepSourceStateMetadata,
} from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { asc, eq, max } from "drizzle-orm";

import {
  createSepAdmissionOperations,
  type SepAdmissionResult,
  type SepAdmissionStore,
} from "./sep-admission";
import {
  buildReadingDerivative,
  buildStateRecords,
  parseStringList,
} from "./sep-admission-builders";
import type {
  SepAdmittedState,
  SepAdmittedStateOperations,
} from "./sep-admitted-state";
import { createSepAdmittedStateReader } from "./sep-admitted-state-reader";
import {
  createSepCaptureClient,
  SepAdmissionError,
  type SepObservationKey,
} from "./sep-capture";
import { decodeCapturedHtml, parseEntryMetadata } from "./sep-html";
import {
  createSepPreviewStore,
  selectLivePreviewForUpdate,
} from "./sep-preview-store";

export function createDrizzleSepAdmissionStore(
  database: typeof db = db,
): SepAdmissionStore & SepAdmittedStateOperations {
  const preview = createSepPreviewStore(database);
  const reader = createSepAdmittedStateReader(database);

  return {
    ...preview,
    ...reader,
    async admit(
      id: string,
      observationKeys: SepObservationKey[],
      now: Date,
      onStage?: (
        stage: "database_persistence" | "reading_derivative_parsing",
      ) => void,
    ): Promise<SepAdmissionResult | undefined> {
      const selectedKeys = (
        ["submitted", "recommended-archive"] as const
      ).filter((key) => observationKeys.includes(key));
      const admitted = await database.transaction(async (tx) => {
        const locked = await selectLivePreviewForUpdate(tx, id, now);
        if (!locked) return undefined;

        const existing = await tx
          .select({
            sourceStateId: sepSourceStateMetadata.sourceStateId,
            observationKey: sepSourceStateMetadata.observationKey,
            sourceId: sourceStates.sourceId,
          })
          .from(sepSourceStateMetadata)
          .innerJoin(
            sourceStates,
            eq(sourceStates.id, sepSourceStateMetadata.sourceStateId),
          )
          .where(eq(sepSourceStateMetadata.admissionPreviewId, id))
          .orderBy(asc(sourceStates.sequence));
        if (existing.length > 0) {
          const existingKeys = existing
            .map(({ observationKey }) => observationKey)
            .sort();
          if (existingKeys.join() !== [...selectedKeys].sort().join()) {
            throw new SepAdmissionError(
              "This preview was already admitted with a different observation selection",
            );
          }
          return {
            sourceId: existing[0]?.sourceId as string,
            stateIds: existing.map(({ sourceStateId }) => sourceStateId),
          };
        }

        const previewResources = await tx
          .select()
          .from(sepPreviewResources)
          .where(eq(sepPreviewResources.previewId, id));
        for (const key of selectedKeys) {
          if (
            !previewResources.some(
              (resource) =>
                resource.observationKey === key && resource.role === "main",
            )
          ) {
            throw new SepAdmissionError(
              `${observationLabel(key)} observation is unavailable for admission`,
            );
          }
        }

        await tx
          .insert(sources)
          .values({
            title: locked.title,
            stableKey: locked.stableKey,
            admittedAt: now,
          })
          .onConflictDoNothing({ target: sources.stableKey });
        const [source] = await tx
          .select()
          .from(sources)
          .where(eq(sources.stableKey, locked.stableKey))
          .for("update");
        if (!source) {
          throw new Error(
            `SEP Source ${locked.stableKey} could not be created`,
          );
        }
        const [sequenceRow] = await tx
          .select({ value: max(sourceStates.sequence) })
          .from(sourceStates)
          .where(eq(sourceStates.sourceId, source.id));
        const firstSequence = (sequenceRow?.value ?? -1) + 1;
        const stateRecords = buildStateRecords({
          preview: locked,
          previewResources,
          selectedKeys,
          sourceId: source.id,
          firstSequence,
          now,
        });
        await tx.insert(sourceStates).values(stateRecords);
        const submittedMetadata = {
          title: locked.title,
          authors: parseStringList(locked.authors),
          publisher: locked.publisher,
          publicationHistory: parseStringList(locked.publicationHistory),
        };
        const stateResources = stateRecords.map((state) => {
          const resources = resourcesForState(
            previewResources,
            state.observationKey,
          );
          const main = resources.find((resource) => resource.role === "main");
          if (!main)
            throw new Error("Selected observation lost its main resource");
          return {
            state,
            resources,
            main,
            metadata:
              state.observationKey === "submitted"
                ? submittedMetadata
                : parseEntryMetadata(
                    decodeCapturedHtml(
                      main.body,
                      main.charset ?? undefined,
                      main.role,
                    ),
                  ),
          };
        });
        await tx.insert(sepSourceStateMetadata).values(
          stateResources.map(({ state, metadata }) => ({
            sourceStateId: state.id,
            admissionPreviewId: id,
            observationKey: state.observationKey,
            ...metadata,
          })),
        );
        await tx.insert(sourceStateResources).values(
          stateResources.flatMap(({ state, resources }) =>
            resources.map((resource) => ({
              id: randomUUID(),
              sourceStateId: state.id,
              identity: resource.identity,
              role: resource.role,
              requestedUrl: resource.requestedUrl,
              finalUrl: resource.finalUrl,
              status: resource.status,
              mediaType: resource.mediaType,
              charset: resource.charset,
              contentEncoding: resource.contentEncoding,
              retrievedAt: resource.retrievedAt,
              selectedHeaders: resource.selectedHeaders,
              requestCount: resource.requestCount,
              downloadedBytes: resource.downloadedBytes,
              byteLength: resource.byteLength,
              sha256: resource.sha256,
              discoveryEdge: resource.discoveryEdge,
              depth: resource.depth,
              body: resource.body,
            })),
          ),
        );
        onStage?.("reading_derivative_parsing");
        const derivatives = stateResources.map(
          ({ state, resources, main, metadata }) => {
            return buildReadingDerivative({
              source,
              state,
              main,
              resources,
              metadata,
              preview: locked,
            });
          },
        );
        onStage?.("database_persistence");
        await tx.insert(sourceStateDerivatives).values(derivatives);
        await tx.insert(sourceStateDerivativeActivations).values(
          derivatives.map((derivative) => ({
            sourceStateId: derivative.sourceStateId,
            derivativeId: derivative.id,
            kind: derivative.kind,
            activatedAt: now,
          })),
        );
        return {
          sourceId: source.id,
          stateIds: stateRecords.map(({ id: stateId }) => stateId),
        };
      });
      if (!admitted) return undefined;
      const states = await Promise.all(
        admitted.stateIds.map((stateId) =>
          reader.getState(admitted.sourceId, stateId),
        ),
      );
      return {
        sourceId: admitted.sourceId,
        states: states.filter((state): state is SepAdmittedState =>
          Boolean(state),
        ),
      };
    },
  };
}

function observationLabel(key: SepObservationKey) {
  return key === "submitted" ? "Active" : "Recommended archive";
}

function resourcesForState(
  resources: Array<typeof sepPreviewResources.$inferSelect>,
  observationKey: string | null,
) {
  return resources.filter(
    (resource) => resource.observationKey === observationKey,
  );
}

export const sepAdmissionOperations = createSepAdmissionOperations({
  store: createDrizzleSepAdmissionStore(),
  capture: createSepCaptureClient(),
});
