import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { SepObservationKey } from "./sep-capture";
import { createSepReadingDerivative } from "./sep-reading";
import {
  type SepReadingContract,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";

export const sepObservationKeySchema = z.enum([
  "submitted",
  "recommended-archive",
]);

export const sepResourceRoleSchema = z.enum([
  "main",
  "citation-information",
  "supplement",
  "notes",
  "figure-description",
  "unknown-component",
  "semantic-asset",
]);

export function parseStringList(value: unknown) {
  return z.array(z.string()).parse(value);
}

export interface AdmissionPreviewFields {
  rightsBasis: string;
  sensitivityLevel: string;
}

export interface PreviewResourceFields {
  observationKey: string;
  role: string;
  requestedUrl: string;
}

export interface BuildStateRecordsInput {
  preview: AdmissionPreviewFields;
  previewResources: PreviewResourceFields[];
  selectedKeys: readonly SepObservationKey[];
  sourceId: string;
  firstSequence: number;
  now: Date;
}

export interface AdmissionStateRecord {
  id: string;
  sourceId: string;
  sequence: number;
  adapterId: "sep";
  observationKey: SepObservationKey;
  canonicalUrl: string;
  rightsBasis: string;
  sensitivityLevel: string;
  admittedAt: Date;
}

export function buildStateRecords({
  preview,
  previewResources,
  selectedKeys,
  sourceId,
  firstSequence,
  now,
}: BuildStateRecordsInput): AdmissionStateRecord[] {
  return selectedKeys.map((observationKey, index) => {
    const main = previewResources.find(
      (resource) =>
        resource.observationKey === observationKey && resource.role === "main",
    );
    if (!main) throw new Error("Selected observation lost its main resource");
    return {
      id: randomUUID(),
      sourceId,
      sequence: firstSequence + index,
      adapterId: "sep",
      observationKey,
      canonicalUrl: main.requestedUrl,
      rightsBasis: preview.rightsBasis,
      sensitivityLevel: preview.sensitivityLevel,
      admittedAt: now,
    };
  });
}

export interface AdmissionCapturePreview {
  captureDiagnostics: unknown;
}

export interface ReadingCaptureReport {
  completeness: "complete" | "partial" | "stopped";
  readingReadiness: "ready" | "degraded";
  readinessReasons: string[];
}

export function buildReadingCaptureReport(
  preview: AdmissionCapturePreview,
): ReadingCaptureReport {
  return z
    .object({
      completeness: z.enum(["complete", "partial", "stopped"]),
      readingReadiness: z.enum(["ready", "degraded"]),
      readinessReasons: z.array(z.string()),
    })
    .parse(preview.captureDiagnostics);
}

export interface AdmissionReadingResource {
  identity: string;
  role: string;
  requestedUrl: string;
  finalUrl: string;
  retrievedAt: Date;
  sha256: string;
  mediaType?: string | null;
  charset?: string | null;
  body: Buffer;
  discoveryEdge: string;
}

export interface BuildReadingDerivativeInput {
  source: { id: string };
  state: {
    id: string;
    observationKey: string;
    admittedAt: Date;
  };
  main: AdmissionReadingResource;
  resources: AdmissionReadingResource[];
  metadata: {
    title: string;
    authors: string[];
    publisher: string;
    publicationHistory: string[];
  };
  preview: {
    captureDiagnostics: unknown;
    diagnostics: unknown;
  };
}

export interface AdmissionReadingDerivativeRecord {
  id: string;
  sourceStateId: string;
  kind: typeof sepReadingDerivativeKind;
  valid: true;
  payload: SepReadingContract;
  validation: { schema: "sep-reading-v1"; status: "valid" };
}

export function buildReadingDerivative({
  source,
  state,
  main,
  resources,
  metadata,
  preview,
}: BuildReadingDerivativeInput): AdmissionReadingDerivativeRecord {
  const capture = buildReadingCaptureReport(preview);
  return {
    id: randomUUID(),
    sourceStateId: state.id,
    kind: sepReadingDerivativeKind,
    valid: true,
    payload: createSepReadingDerivative({
      source: {
        id: source.id,
        stateId: state.id,
        title: metadata.title,
        authors: metadata.authors,
        publisher: metadata.publisher,
        publicationHistory: metadata.publicationHistory,
        canonicalUrl: main.requestedUrl,
        observation: sepObservationKeySchema.parse(state.observationKey),
        admittedAt: state.admittedAt.toISOString(),
      },
      main: {
        ...main,
        mediaType: main.mediaType ?? undefined,
      },
      resources: resources.map(({ identity, sha256 }) => ({
        identity,
        sha256,
      })),
      components: resources.map((resource) => ({
        identity: resource.identity,
        role: sepResourceRoleSchema.parse(resource.role),
        requestedUrl: resource.requestedUrl,
        finalUrl: resource.finalUrl,
        retrievedAt: resource.retrievedAt,
        sha256: resource.sha256,
        mediaType: resource.mediaType ?? undefined,
        charset: resource.charset,
        body: resource.body,
        discoveryEdge: resource.discoveryEdge,
      })),
      capture: {
        completeness: capture.completeness,
        readingReadiness: capture.readingReadiness,
        readinessReasons: capture.readinessReasons,
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
}
