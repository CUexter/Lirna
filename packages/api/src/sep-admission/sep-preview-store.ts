import { randomUUID } from "node:crypto";
import { db } from "@lirna/db";
import {
  sepAdmissionPreviews,
  sepPreviewResources,
  sepSourceStateMetadata,
} from "@lirna/db/schema/sep-admission";
import { and, asc, eq, gt, lte } from "drizzle-orm";

import type {
  SepAdmissionCreateRecord,
  SepAdmissionStore,
  SepAdmissionStoredPreview,
} from "./sep-admission";

export type SepPreviewStore = Pick<
  SepAdmissionStore,
  | "create"
  | "getActive"
  | "extendActive"
  | "delete"
  | "deleteExpired"
  | "claimExpandedRetry"
  | "replaceCapture"
>;

type SepAdmissionDatabase = typeof db;
export type SepAdmissionTransaction = Parameters<
  Parameters<SepAdmissionDatabase["transaction"]>[0]
>[0];

export function createSepPreviewStore(
  database: SepAdmissionDatabase = db,
): SepPreviewStore {
  return {
    async create(record: SepAdmissionCreateRecord): Promise<void> {
      await database.transaction(async (tx) => {
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
    },

    async getActive(
      id: string,
      now: Date,
    ): Promise<SepAdmissionStoredPreview | undefined> {
      const [preview] = await database
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
      const resources = await database
        .select()
        .from(sepPreviewResources)
        .where(eq(sepPreviewResources.previewId, id))
        .orderBy(asc(sepPreviewResources.role));
      return { preview, resources };
    },

    async extendActive(
      id: string,
      now: Date,
      expiresAt: Date,
    ): Promise<boolean> {
      const updated = await database
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
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await database
        .delete(sepAdmissionPreviews)
        .where(eq(sepAdmissionPreviews.id, id))
        .returning({ id: sepAdmissionPreviews.id });
      return deleted.length > 0;
    },

    async deleteExpired(now: Date): Promise<number> {
      const deleted = await database
        .delete(sepAdmissionPreviews)
        .where(lte(sepAdmissionPreviews.expiresAt, now))
        .returning({ id: sepAdmissionPreviews.id });
      return deleted.length;
    },

    async claimExpandedRetry(
      id: string,
      now: Date,
    ): Promise<"claimed" | "unavailable" | "already-used"> {
      return database.transaction(async (tx) => {
        const [current] = await tx
          .select({
            captureDiagnostics: sepAdmissionPreviews.captureDiagnostics,
          })
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
    },

    async replaceCapture(
      id: string,
      now: Date,
      record: Omit<SepAdmissionCreateRecord, "id" | "createdAt" | "expiresAt">,
    ): Promise<"updated" | "unavailable"> {
      return database.transaction(async (tx) => {
        const current = await selectLivePreviewForUpdate(tx, id, now);
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
    },
  };
}

export async function selectLivePreviewForUpdate(
  tx: SepAdmissionTransaction,
  id: string,
  now: Date,
) {
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
  return preview;
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
