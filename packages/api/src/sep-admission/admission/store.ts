import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import {
  sepAdmissionOutcomes,
  sepPreviewResources,
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
import { asc, eq, max } from "drizzle-orm";
import type { CreatedReadingDerivative } from "../../derivative-updates/reading-derivative-creation";
import {
  createSepCaptureClient,
  SepAdmissionError,
  type SepObservationKey,
} from "../capture/client";
import { decodeCapturedHtml, parseEntryMetadata } from "../capture/html";
import type { SepAdmittedState } from "../state/admitted-state";
import { readSepAdmittedState } from "../state/projection";
import {
  buildReadingDerivative,
  buildStateRecords,
  parseStringList,
} from "./builders";
import {
  findUnchangedStates,
  readAdmissionOutcome,
  resourcesForState,
} from "./deduplication";
import {
  createSepAdmissionOperations,
  type SepAdmissionResult,
  type SepAdmissionStore,
} from "./operations";
import {
  createSepPreviewStore,
  type SepAdmissionTransaction,
  selectLivePreviewForUpdate,
} from "./preview-store";

// PostgreSQL fixtures import this after installing their isolated database environment.
// fallow-ignore-next-line unused-export
export function createDrizzleSepAdmissionStore(
  database: typeof db,
): SepAdmissionStore {
  const preview = createSepPreviewStore(database);

  return {
    ...preview,
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

        const existing = await readAdmissionOutcome(tx, id, selectedKeys);
        if (existing) return existing;

        const previewResources = await tx
          .select()
          .from(sepPreviewResources)
          .where(eq(sepPreviewResources.previewId, id))
          .orderBy(asc(sepPreviewResources.identity));
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
        if (locked.replacesSourceId && locked.replacesSourceId !== source.id) {
          const [replacementTarget] = await tx
            .select({ stableKey: sources.stableKey })
            .from(sources)
            .where(eq(sources.id, locked.replacesSourceId))
            .limit(1);
          if (!replacementTarget || replacementTarget.stableKey !== null) {
            throw new SepAdmissionError(
              "Replacement target must be a legacy SEP text Source",
            );
          }
          await tx
            .insert(sourceRelations)
            .values({
              sourceId: source.id,
              relatedSourceId: locked.replacesSourceId,
              kind: "replacement-capture-for",
              createdAt: now,
            })
            .onConflictDoNothing();
        }
        const unchanged = await findUnchangedStates(
          tx,
          source.id,
          selectedKeys,
          previewResources,
        );
        const changedKeys = selectedKeys.filter((key) => !unchanged.has(key));
        const [sequenceRow] = await tx
          .select({ value: max(sourceStates.sequence) })
          .from(sourceStates)
          .where(eq(sourceStates.sourceId, source.id));
        const firstSequence = (sequenceRow?.value ?? -1) + 1;
        const stateRecords = buildStateRecords({
          preview: locked,
          previewResources,
          selectedKeys: changedKeys,
          sourceId: source.id,
          firstSequence,
          now,
        });
        if (stateRecords.length > 0) {
          await tx.insert(sourceStates).values(stateRecords);
        }
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
        if (stateResources.length > 0) {
          await tx.insert(sepSourceStateMetadata).values(
            stateResources.map(({ state, metadata }) => ({
              sourceStateId: state.id,
              admissionPreviewId: id,
              observationKey: state.observationKey,
              ...metadata,
              diagnostics: locked.diagnostics,
              captureDiagnostics: locked.captureDiagnostics,
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
        }
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
        if (derivatives.length > 0) {
          await tx.insert(sourceStateDerivatives).values(derivatives);
          await activateInitialDerivatives(tx, derivatives, now);
        }
        const outcomes = selectedKeys.map((observationKey) => {
          const created = stateRecords.find(
            (state) => state.observationKey === observationKey,
          );
          return created
            ? {
                observationKey,
                stateId: created.id,
                disposition: "created" as const,
              }
            : {
                observationKey,
                stateId: unchanged.get(observationKey) as string,
                disposition: "unchanged" as const,
              };
        });
        await tx.insert(sepAdmissionOutcomes).values(
          outcomes.map((outcome) => ({
            admissionPreviewId: id,
            observationKey: outcome.observationKey,
            sourceStateId: outcome.stateId,
            disposition: outcome.disposition,
          })),
        );
        return {
          sourceId: source.id,
          stateIds: outcomes.map(({ stateId }) => stateId),
          outcomes,
        };
      });
      if (!admitted) return undefined;
      const states = await Promise.all(
        admitted.stateIds.map((stateId) =>
          database.transaction(
            (tx) => readSepAdmittedState(tx, admitted.sourceId, stateId),
            { isolationLevel: "repeatable read", accessMode: "read only" },
          ),
        ),
      );
      return {
        sourceId: admitted.sourceId,
        states: states.filter((state): state is SepAdmittedState =>
          Boolean(state),
        ),
        outcomes: admitted.outcomes,
      };
    },
  };
}

async function activateInitialDerivatives(
  tx: SepAdmissionTransaction,
  derivatives: CreatedReadingDerivative[],
  activatedAt: Date,
) {
  const values = derivatives
    .filter(({ valid }) => valid)
    .map((derivative) => ({
      sourceStateId: derivative.sourceStateId,
      derivativeId: derivative.id,
      kind: derivative.kind,
      sequence: 1,
      activatedAt,
    }));
  if (values.length > 0)
    await tx.insert(sourceStateDerivativeActivations).values(values);
}

function observationLabel(key: SepObservationKey) {
  return key === "submitted" ? "Active" : "Recommended archive";
}

export function createDrizzleSepAdmissionOperations(database: typeof db) {
  return createSepAdmissionOperations({
    store: createDrizzleSepAdmissionStore(database),
    capture: createSepCaptureClient(),
  });
}
