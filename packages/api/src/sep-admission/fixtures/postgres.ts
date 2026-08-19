import { createHash, randomUUID } from "node:crypto";
import {
  sepAdmissionPreviews,
  sepPreviewResources,
} from "@lirna/db/schema/sep-admission";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";

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
  process.env.BETTER_AUTH_SECRET = "integration-only-secret-at-least-32-chars";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";

  const { createDrizzleSepAdmissionStore } = await import(
    "../sep-admission-store"
  );
  return {
    database: testDatabase.database,
    store: createDrizzleSepAdmissionStore(testDatabase.database),
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
    title = "Admission integration",
    observations,
    bodies,
    citationBody = Buffer.from("citation"),
    charset = "utf-8",
    now = new Date(),
  }: {
    id?: string;
    stableKey: string;
    title?: string;
    observations: Array<"submitted" | "recommended-archive">;
    bodies?: Partial<Record<"submitted" | "recommended-archive", Buffer>>;
    citationBody?: Buffer;
    charset?: string;
    now?: Date;
  },
) {
  await database.insert(sepAdmissionPreviews).values({
    id,
    stableKey,
    submittedUrl: "https://plato.stanford.edu/entries/admission/",
    recommendedArchiveUrl: observations.includes("recommended-archive")
      ? "https://plato.stanford.edu/archives/sum2026/entries/admission/"
      : null,
    title,
    authors: ["Integration Author"],
    publisher: "Metaphysics Research Lab, Stanford University",
    publicationHistory: ["First published 2026"],
    diagnostics: [],
    captureDiagnostics: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
    },
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
    processingMilliseconds: 1,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await database.insert(sepPreviewResources).values(
    observations.flatMap((observation) => {
      const body =
        bodies?.[observation] ??
        Buffer.from(
          `<html><body><main><p>${observation}</p></main></body></html>`,
        );
      return [
        previewResource({
          previewId: id,
          role: "main",
          identity: observation === "submitted" ? "active:/" : "sum2026:/",
          body,
          observationKey: observation,
          charset,
        }),
        ...(observation === "submitted"
          ? [
              previewResource({
                previewId: id,
                role: "citation-information",
                identity: "citation-information:admission",
                body: citationBody,
              }),
            ]
          : []),
      ];
    }),
  );
  return id;
}

export function previewResource({
  previewId,
  role,
  identity,
  body,
  observationKey = "submitted",
  charset = "utf-8",
}: {
  previewId: string;
  role: "main" | "citation-information";
  identity: string;
  body: Buffer;
  observationKey?: "submitted" | "recommended-archive";
  charset?: string;
}) {
  const url =
    role === "main"
      ? "https://plato.stanford.edu/entries/reading/"
      : "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=reading";
  return {
    id: randomUUID(),
    previewId,
    observationKey,
    identity,
    role,
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    mediaType: "text/html",
    charset,
    retrievedAt: new Date(),
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    requestCount: 1,
    downloadedBytes: body.byteLength,
    byteLength: body.byteLength,
    sha256: hash(body),
    discoveryEdge:
      role === "main" ? "submitted-entry" : "required-citation-information",
    depth: 0,
    body,
  };
}

export function hash(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}
