// biome-ignore lint/style/noExcessiveLinesPerFile: Preview persistence and immutable Source-state admission form one transactional boundary.
import { randomUUID } from "node:crypto";
import { db } from "@lirna/db";
import {
  sepAdmissionPreviews,
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
import { and, asc, desc, eq, gt, lte, max } from "drizzle-orm";
import { z } from "zod";

import {
  createSepAdmissionOperations,
  type SepAdmissionCreateRecord,
  type SepAdmissionResult,
  type SepAdmissionStore,
  type SepAdmissionStoredPreview,
  type SepAdmittedState,
} from "./sep-admission";
import {
  createSepCaptureClient,
  SepAdmissionError,
  type SepObservationKey,
} from "./sep-capture";
import {
  createSepReadingDerivative,
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading";

export class DrizzleSepAdmissionStore implements SepAdmissionStore {
  constructor(private readonly database: typeof db = db) {}

  async create(record: SepAdmissionCreateRecord): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.insert(sepAdmissionPreviews).values({
        id: record.id,
        ...captureValues(record),
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      });
      await tx.insert(sepPreviewResources).values(
        record.resources.map((resource) => ({
          id: randomUUID(),
          previewId: record.id,
          ...resource,
        })),
      );
    });
  }

  async getActive(
    id: string,
    now: Date,
  ): Promise<SepAdmissionStoredPreview | undefined> {
    const [preview] = await this.database
      .select()
      .from(sepAdmissionPreviews)
      .where(
        and(
          eq(sepAdmissionPreviews.id, id),
          gt(sepAdmissionPreviews.expiresAt, now),
        ),
      );
    if (!preview) {
      return undefined;
    }
    const resources = await this.database
      .select()
      .from(sepPreviewResources)
      .where(eq(sepPreviewResources.previewId, id))
      .orderBy(asc(sepPreviewResources.role));
    return { preview, resources };
  }

  async extendActive(id: string, now: Date, expiresAt: Date): Promise<boolean> {
    const updated = await this.database
      .update(sepAdmissionPreviews)
      .set({ expiresAt })
      .where(
        and(
          eq(sepAdmissionPreviews.id, id),
          gt(sepAdmissionPreviews.expiresAt, now),
        ),
      )
      .returning({ id: sepAdmissionPreviews.id });
    return updated.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(sepAdmissionPreviews)
      .where(eq(sepAdmissionPreviews.id, id))
      .returning({ id: sepAdmissionPreviews.id });
    return deleted.length > 0;
  }

  async deleteExpired(now: Date): Promise<number> {
    const deleted = await this.database
      .delete(sepAdmissionPreviews)
      .where(lte(sepAdmissionPreviews.expiresAt, now))
      .returning({ id: sepAdmissionPreviews.id });
    return deleted.length;
  }

  async claimExpandedRetry(
    id: string,
    now: Date,
  ): Promise<"claimed" | "unavailable" | "already-used"> {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select({ captureDiagnostics: sepAdmissionPreviews.captureDiagnostics })
        .from(sepAdmissionPreviews)
        .where(
          and(
            eq(sepAdmissionPreviews.id, id),
            gt(sepAdmissionPreviews.expiresAt, now),
          ),
        )
        .for("update");
      if (!current || (await admissionExists(tx, id))) return "unavailable";
      const report = current.captureDiagnostics;
      if (
        typeof report !== "object" ||
        report === null ||
        !("retryUsed" in report)
      ) {
        throw new Error(
          `SEP Admission preview ${id} has an invalid capture report`,
        );
      }
      if (report.retryUsed === true) return "already-used";
      await tx
        .update(sepAdmissionPreviews)
        .set({ captureDiagnostics: { ...report, retryUsed: true } })
        .where(eq(sepAdmissionPreviews.id, id));
      return "claimed";
    });
  }

  async replaceCapture(
    id: string,
    now: Date,
    record: Omit<SepAdmissionCreateRecord, "id" | "createdAt" | "expiresAt">,
  ): Promise<"updated" | "unavailable"> {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(sepAdmissionPreviews)
        .where(
          and(
            eq(sepAdmissionPreviews.id, id),
            gt(sepAdmissionPreviews.expiresAt, now),
          ),
        )
        .for("update");
      if (!current) {
        return "unavailable";
      }
      if (await admissionExists(tx, id)) return "unavailable";
      await tx
        .update(sepAdmissionPreviews)
        .set(captureValues(record))
        .where(eq(sepAdmissionPreviews.id, id));
      await tx
        .delete(sepPreviewResources)
        .where(eq(sepPreviewResources.previewId, id));
      await tx.insert(sepPreviewResources).values(
        record.resources.map((resource) => ({
          id: randomUUID(),
          previewId: id,
          ...resource,
        })),
      );
      return "updated";
    });
  }

  async admit(
    id: string,
    observationKeys: SepObservationKey[],
    now: Date,
  ): Promise<SepAdmissionResult | undefined> {
    const selectedKeys = (["submitted", "recommended-archive"] as const).filter(
      (key) => observationKeys.includes(key),
    );
    const admitted = await this.database.transaction(async (tx) => {
      const [preview] = await tx
        .select()
        .from(sepAdmissionPreviews)
        .where(
          and(
            eq(sepAdmissionPreviews.id, id),
            gt(sepAdmissionPreviews.expiresAt, now),
          ),
        )
        .for("update");
      if (!preview) return undefined;

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
          title: preview.title,
          stableKey: preview.stableKey,
          admittedAt: now,
        })
        .onConflictDoNothing({ target: sources.stableKey });
      const [source] = await tx
        .select()
        .from(sources)
        .where(eq(sources.stableKey, preview.stableKey))
        .for("update");
      if (!source) {
        throw new Error(`SEP Source ${preview.stableKey} could not be created`);
      }
      const [sequenceRow] = await tx
        .select({ value: max(sourceStates.sequence) })
        .from(sourceStates)
        .where(eq(sourceStates.sourceId, source.id));
      const firstSequence = (sequenceRow?.value ?? -1) + 1;
      const stateRecords = selectedKeys.map((observationKey, index) => {
        const main = previewResources.find(
          (resource) =>
            resource.observationKey === observationKey &&
            resource.role === "main",
        );
        if (!main)
          throw new Error("Selected observation lost its main resource");
        return {
          id: randomUUID(),
          sourceId: source.id,
          sequence: firstSequence + index,
          adapterId: "sep",
          observationKey,
          canonicalUrl: main.requestedUrl,
          rightsBasis: preview.rightsBasis,
          sensitivityLevel: preview.sensitivityLevel,
          admittedAt: now,
        };
      });
      await tx.insert(sourceStates).values(stateRecords);
      const authors = z.array(z.string()).parse(preview.authors);
      const publicationHistory = z
        .array(z.string())
        .parse(preview.publicationHistory);
      await tx.insert(sepSourceStateMetadata).values(
        stateRecords.map((state) => ({
          sourceStateId: state.id,
          admissionPreviewId: id,
          observationKey: state.observationKey,
          title: preview.title,
          authors,
          publisher: preview.publisher,
          publicationHistory,
        })),
      );
      const stateResources = stateRecords.map((state) => ({
        state,
        resources: resourcesForState(previewResources, state.observationKey),
      }));
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
      const derivatives = stateResources.map(({ state, resources }) => {
        const main = resources.find((resource) => resource.role === "main");
        if (!main)
          throw new Error("Selected observation lost its main resource");
        return {
          id: randomUUID(),
          sourceStateId: state.id,
          kind: sepReadingDerivativeKind,
          valid: true,
          payload: createSepReadingDerivative({
            source: {
              id: source.id,
              stateId: state.id,
              title: preview.title,
              authors,
              publisher: preview.publisher,
              publicationHistory,
              canonicalUrl: main.requestedUrl,
              observation: z
                .enum(["submitted", "recommended-archive"])
                .parse(state.observationKey),
              admittedAt: state.admittedAt.toISOString(),
            },
            main,
            resources: resources.map(({ identity, sha256 }) => ({
              identity,
              sha256,
            })),
            components: resources.map((resource) => ({
              identity: resource.identity,
              role: z
                .enum([
                  "main",
                  "citation-information",
                  "supplement",
                  "notes",
                  "figure-description",
                  "unknown-component",
                  "semantic-asset",
                ])
                .parse(resource.role),
              requestedUrl: resource.requestedUrl,
              finalUrl: resource.finalUrl,
              retrievedAt: resource.retrievedAt,
              sha256: resource.sha256,
              mediaType: resource.mediaType,
              charset: resource.charset,
              body: resource.body,
              discoveryEdge: resource.discoveryEdge,
            })),
            capture: {
              completeness: z
                .enum(["complete", "partial", "stopped"])
                .parse(captureReport(preview).completeness),
              readingReadiness: z
                .enum(["ready", "degraded"])
                .parse(captureReport(preview).readingReadiness),
              readinessReasons: z
                .array(z.string())
                .parse(captureReport(preview).readinessReasons),
              diagnostics: z
                .array(
                  z.object({
                    level: z.enum(["info", "warning"]),
                    code: z.string(),
                    message: z.string(),
                  }),
                )
                .parse(preview.diagnostics),
            },
          }),
          validation: { schema: "sep-reading-v1", status: "valid" },
        };
      });
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
        stateIds: stateRecords.map(({ id }) => id),
      };
    });
    if (!admitted) return undefined;
    const states = await Promise.all(
      admitted.stateIds.map((stateId) =>
        this.getState(admitted.sourceId, stateId),
      ),
    );
    return {
      sourceId: admitted.sourceId,
      states: states.filter((state): state is SepAdmittedState =>
        Boolean(state),
      ),
    };
  }

  async getState(
    sourceId: string,
    stateId: string,
  ): Promise<SepAdmittedState | undefined> {
    const [row] = await this.database
      .select({ state: sourceStates, metadata: sepSourceStateMetadata })
      .from(sourceStates)
      .innerJoin(
        sepSourceStateMetadata,
        eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
      )
      .where(
        and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
      );
    if (!row) return undefined;
    const resources = await this.database
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
      observationKey: z
        .enum(["submitted", "recommended-archive"])
        .parse(row.state.observationKey),
      canonicalUrl: row.state.canonicalUrl ?? "",
      title: row.metadata.title,
      authors: z.array(z.string()).parse(row.metadata.authors),
      publisher: row.metadata.publisher,
      publicationHistory: z
        .array(z.string())
        .parse(row.metadata.publicationHistory),
      admittedAt: row.state.admittedAt.toISOString(),
      resources: resources.map((resource) => ({
        role: z
          .enum([
            "main",
            "citation-information",
            "supplement",
            "notes",
            "figure-description",
            "unknown-component",
            "semantic-asset",
          ])
          .parse(resource.role),
        requestedUrl: resource.requestedUrl,
        finalUrl: resource.finalUrl,
        mediaType: resource.mediaType,
        byteLength: resource.byteLength,
        sha256: resource.sha256,
        discoveryEdge: resource.discoveryEdge,
      })),
    };
  }

  async getReading(sourceId: string, stateId: string) {
    const [row] = await this.database
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
  }
}

function observationLabel(key: SepObservationKey) {
  return key === "submitted" ? "Active" : "Recommended archive";
}

async function admissionExists(
  database: Pick<typeof db, "select">,
  previewId: string,
): Promise<boolean> {
  const rows = await database
    .select({ sourceStateId: sepSourceStateMetadata.sourceStateId })
    .from(sepSourceStateMetadata)
    .where(eq(sepSourceStateMetadata.admissionPreviewId, previewId))
    .limit(1);
  return rows.length > 0;
}

function captureValues(
  record: Omit<SepAdmissionCreateRecord, "id" | "createdAt" | "expiresAt">,
) {
  return {
    stableKey: record.stableKey,
    submittedUrl: record.submittedUrl,
    recommendedArchiveUrl: record.recommendedArchiveUrl,
    title: record.title,
    authors: record.authors,
    publisher: record.publisher,
    publicationHistory: record.publicationHistory,
    diagnostics: record.diagnostics,
    captureDiagnostics: record.captureReport,
    processingMilliseconds: record.processingMilliseconds,
  };
}

function resourcesForState(
  resources: Array<typeof sepPreviewResources.$inferSelect>,
  observationKey: string | null,
) {
  return resources.filter(
    (resource) =>
      resource.observationKey === observationKey ||
      (observationKey === "recommended-archive" &&
        resource.observationKey === "submitted" &&
        resource.role === "citation-information"),
  );
}

function captureReport(preview: typeof sepAdmissionPreviews.$inferSelect) {
  return z
    .object({
      completeness: z.enum(["complete", "partial", "stopped"]),
      readingReadiness: z.enum(["ready", "degraded"]),
      readinessReasons: z.array(z.string()),
    })
    .parse(preview.captureDiagnostics);
}

export const sepAdmissionOperations = createSepAdmissionOperations({
  store: new DrizzleSepAdmissionStore(),
  capture: createSepCaptureClient(),
});
