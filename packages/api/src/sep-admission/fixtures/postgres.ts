import { randomUUID } from "node:crypto";
import {
  sepAdmissionPreviews,
  sepPreviewResources,
} from "@lirna/db/schema/sep-admission";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

import type { SepAdmissionCreateRecord } from "../admission/operations";
import {
  type AdmissionObservationKey,
  admissionCaptureLimits,
  admissionPreviewDefaults,
  previewResourcesForObservations,
  previewRowFields,
  recommendedArchiveUrl,
} from "./admission-preview";

export {
  hash,
  previewResource,
} from "./admission-preview";

export const sepAdmissionPostgresAdminUrl = process.env.POSTGRES_ADMIN_URL;

export async function openSepAdmissionPostgres(label: string) {
  if (!sepAdmissionPostgresAdminUrl) {
    throw new Error("POSTGRES_ADMIN_URL is required");
  }

  const testDatabase = await createPostgresTestDatabase(
    sepAdmissionPostgresAdminUrl,
    `lirna_api_${label}_${process.pid}_${randomUUID().replaceAll("-", "")}`,
  );
  process.env.DATABASE_URL = testDatabase.databaseUrl;
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";

  const [
    { createDrizzleSepAdmissionStore },
    { DrizzleActiveReadingDerivativeStore },
    { createSepAdmittedStateReader },
  ] = await Promise.all([
    import("../admission/store"),
    import("../state/active-reading-derivative-store"),
    import("../state/admitted-state-reader"),
  ]);
  const activeReading = new DrizzleActiveReadingDerivativeStore(
    testDatabase.database,
  );
  return {
    database: testDatabase.database,
    store: {
      ...createDrizzleSepAdmissionStore(testDatabase.database),
      ...createSepAdmittedStateReader(testDatabase.database, activeReading),
    },
    cleanup: testDatabase.cleanup,
  };
}

export type SepAdmissionPostgres = Awaited<
  ReturnType<typeof openSepAdmissionPostgres>
>;

export async function insertPreview(
  database: SepAdmissionPostgres["database"],
  {
    id = randomUUID(),
    stableKey,
    title = admissionPreviewDefaults.title,
    authors = admissionPreviewDefaults.authors,
    publisher = admissionPreviewDefaults.publisher,
    publicationHistory = admissionPreviewDefaults.publicationHistory,
    observations,
    bodies,
    citationBody = Buffer.from("citation"),
    charset = "utf-8",
    now = new Date(),
  }: {
    id?: string;
    stableKey: string;
    title?: string;
    authors?: readonly string[];
    publisher?: string;
    publicationHistory?: readonly string[];
    observations: AdmissionObservationKey[];
    bodies?: Partial<Record<AdmissionObservationKey, Buffer>>;
    citationBody?: Buffer;
    charset?: string;
    now?: Date;
  },
) {
  await database.insert(sepAdmissionPreviews).values({
    id,
    stableKey,
    submittedUrl: admissionPreviewDefaults.submittedUrl,
    recommendedArchiveUrl: recommendedArchiveUrl(observations) ?? null,
    ...previewRowFields({ title, now }),
    authors: [...authors],
    publisher,
    publicationHistory: [...publicationHistory],
  });
  await database.insert(sepPreviewResources).values(
    previewResourcesForObservations({
      previewId: id,
      observations,
      bodies,
      citationBody,
      charset,
    }),
  );
  return id;
}

export function admissionCreateRecord({
  id = randomUUID(),
  stableKey,
  title = admissionPreviewDefaults.title,
  now = new Date(),
  expiresAt = new Date(now.getTime() + 60_000),
  observations = ["submitted"],
  retryUsed = false,
}: {
  id?: string;
  stableKey: string;
  title?: string;
  now?: Date;
  expiresAt?: Date;
  observations?: AdmissionObservationKey[];
  retryUsed?: boolean;
}): SepAdmissionCreateRecord {
  return {
    id,
    stableKey,
    submittedUrl: admissionPreviewDefaults.submittedUrl,
    recommendedArchiveUrl: recommendedArchiveUrl(observations),
    title,
    authors: [...admissionPreviewDefaults.authors],
    publisher: admissionPreviewDefaults.publisher,
    publicationHistory: [...admissionPreviewDefaults.publicationHistory],
    diagnostics: [],
    captureReport: {
      budget: retryUsed ? "expanded" : "standard",
      ...admissionPreviewDefaults.captureDiagnostics,
      readinessReasons: [
        ...admissionPreviewDefaults.captureDiagnostics.readinessReasons,
      ],
      unresolvedResources: [],
      limits: { ...admissionCaptureLimits },
      retryUsed,
    },
    processingMilliseconds: 1,
    createdAt: now,
    expiresAt,
    resources: previewResourcesForObservations({
      previewId: id,
      observations,
    }).map(toCapturedResource),
  };
}

function toCapturedResource(
  row: ReturnType<typeof previewResourcesForObservations>[number],
): SepAdmissionCreateRecord["resources"][number] {
  const { id: _id, previewId: _previewId, ...resource } = row;
  return resource;
}
