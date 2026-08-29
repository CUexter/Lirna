import { z } from "zod";
import {
  parseStringList,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./builders";
import { sepAdmissionPolicy } from "./contract";
import type {
  SepAdmissionPreview,
  SepAdmissionStoredPreview,
} from "./operations";

export const diagnosticSchema = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
});
const captureReportSchema = z.object({
  budget: z.enum(["standard", "expanded"]),
  completeness: z.enum(["complete", "partial", "stopped"]),
  readingReadiness: z.enum(["ready", "degraded"]),
  readinessReasons: z.array(z.string()),
  unresolvedResources: z.array(
    z.object({
      url: z.string(),
      parentIdentity: z.string(),
      role: z.enum([
        "supplement",
        "notes",
        "figure-description",
        "unknown-component",
        "semantic-asset",
      ]),
      depth: z.number().int().nonnegative(),
      reason: z.string(),
      limit: z.boolean(),
    }),
  ),
  limits: z.object({
    maxComponents: z.number().int().positive(),
    maxAssets: z.number().int().positive(),
    maxResourceBytes: z.number().int().positive(),
    maxTotalBytes: z.number().int().positive(),
    maxDepth: z.number().int().positive(),
    maxRedirects: z.number().int().positive(),
    timeoutMilliseconds: z.number().int().positive(),
    maxConcurrency: z.number().int().positive(),
  }),
  retryUsed: z.boolean(),
});

export const admittedCaptureReportSchema = z.union([
  captureReportSchema,
  z.object({
    budget: z.literal("unknown"),
    completeness: z.literal("partial"),
    readingReadiness: z.literal("degraded"),
    readinessReasons: z.array(z.string()),
    unresolvedResources: captureReportSchema.shape.unresolvedResources,
    limits: z.null(),
    retryUsed: z.null(),
  }),
]);

export function toSepAdmissionPreview({
  preview,
  resources,
  existingStates = [],
}: SepAdmissionStoredPreview): SepAdmissionPreview {
  const authors = parseStringList(preview.authors);
  const publicationHistory = parseStringList(preview.publicationHistory);
  const diagnostics = z.array(diagnosticSchema).parse(preview.diagnostics);
  const captureReport = captureReportSchema.parse(preview.captureDiagnostics);
  const typedResources = resources.map((resource) => {
    const role = sepResourceRoleSchema.parse(resource.role);
    return {
      observationKey: sepObservationKeySchema.parse(resource.observationKey),
      identity: resource.identity,
      role,
      requestedUrl: resource.requestedUrl,
      finalUrl: resource.finalUrl,
      status: resource.status,
      mediaType: resource.mediaType,
      charset: resource.charset ?? undefined,
      contentEncoding: resource.contentEncoding ?? undefined,
      selectedHeaders: z
        .record(z.string(), z.string())
        .parse(resource.selectedHeaders),
      requestCount: resource.requestCount,
      downloadedBytes: resource.downloadedBytes,
      retrievedAt: resource.retrievedAt.toISOString(),
      byteLength: resource.byteLength,
      sha256: resource.sha256,
      discoveryEdge: resource.discoveryEdge,
      depth: resource.depth,
    };
  });
  if (!typedResources.some((resource) => resource.role === "main")) {
    throw new Error(
      `SEP Admission preview ${preview.id} is missing its main entry`,
    );
  }
  if (
    !typedResources.some((resource) => resource.role === "citation-information")
  ) {
    throw new Error(
      `SEP Admission preview ${preview.id} is missing citation information`,
    );
  }
  const activeResources = typedResources.filter(
    (resource) => resource.observationKey === "submitted",
  );
  const archiveResources = typedResources.filter(
    (resource) => resource.observationKey === "recommended-archive",
  );
  const observations: SepAdmissionPreview["observations"] = [
    {
      key: "submitted",
      label: "Active",
      canonicalUrl:
        activeResources.find((resource) => resource.role === "main")
          ?.requestedUrl ?? preview.submittedUrl,
      resources: activeResources,
    },
    ...(archiveResources.length > 0
      ? [
          {
            key: "recommended-archive" as const,
            label: "Recommended archive" as const,
            canonicalUrl:
              archiveResources.find((resource) => resource.role === "main")
                ?.requestedUrl ??
              preview.recommendedArchiveUrl ??
              "",
            resources: archiveResources,
          },
        ]
      : []),
  ];
  const updateObservations = typedResources
    .filter((resource) => resource.role === "main")
    .map(({ observationKey }) => {
      const observed = typedResources.filter(
        (resource) => resource.observationKey === observationKey,
      );
      const compared = existingStates
        .filter((state) => state.observationKey === observationKey)
        .find((state) => manifestsEqual(observed, state.resources));
      return {
        key: observationKey,
        result: compared
          ? ("unchanged" as const)
          : existingStates.some(
                (state) => state.observationKey === observationKey,
              )
            ? ("changed" as const)
            : ("new" as const),
        ...(compared ? { comparedStateId: compared.id } : {}),
      };
    });
  return {
    id: preview.id,
    stableKey: preview.stableKey,
    title: preview.title,
    authors,
    publisher: preview.publisher,
    publicationHistory,
    submittedUrl: preview.submittedUrl,
    recommendedArchiveUrl: preview.recommendedArchiveUrl ?? undefined,
    policy: sepAdmissionPolicy,
    metrics: {
      requests: resources.reduce(
        (total, resource) => total + resource.requestCount,
        0,
      ),
      downloadedBytes: resources.reduce(
        (total, resource) => total + resource.downloadedBytes,
        0,
      ),
      retainedBytes: resources.reduce(
        (total, resource) => total + resource.body.byteLength,
        0,
      ),
      processingMilliseconds: preview.processingMilliseconds,
    },
    createdAt: preview.createdAt.toISOString(),
    expiresAt: preview.expiresAt.toISOString(),
    diagnostics,
    capture: {
      ...captureReport,
      retryAvailable: !captureReport.retryUsed,
    },
    resources: typedResources,
    observations,
    comparison: compareObservations(activeResources, archiveResources),
    ...(preview.replacesSourceId
      ? {
          update: {
            sourceId: preview.replacesSourceId,
            observations: updateObservations,
          },
        }
      : {}),
  };
}

function manifestsEqual(
  observed: SepAdmissionPreview["resources"],
  existing: Array<{ identity: string; sha256: string; byteLength: number }>,
) {
  if (observed.length !== existing.length) return false;
  const byIdentity = new Map(
    existing.map((resource) => [resource.identity, resource]),
  );
  return observed.every((resource) => {
    const prior = byIdentity.get(resource.identity);
    return (
      prior?.sha256 === resource.sha256 &&
      prior.byteLength === resource.byteLength
    );
  });
}

function compareObservations(
  active: SepAdmissionPreview["resources"],
  archive: SepAdmissionPreview["resources"],
): SepAdmissionPreview["comparison"] {
  if (archive.length === 0) {
    return {
      result: "active-only",
      message: "No recommended archived observation was available to compare.",
    };
  }
  const manifest = (resources: SepAdmissionPreview["resources"]) =>
    resources
      .filter((resource) => resource.role !== "citation-information")
      .map((resource) => ({
        identity: resource.identity.slice(resource.identity.indexOf(":")),
        role: resource.role,
        byteLength: resource.byteLength,
        sha256: resource.sha256,
      }))
      .sort((left, right) => left.identity.localeCompare(right.identity));
  const equivalent =
    JSON.stringify(manifest(active)) === JSON.stringify(manifest(archive));
  return equivalent
    ? {
        result: "equivalent",
        message:
          "Active and recommended archive publication resources are byte-equivalent; their provenance remains separate.",
      }
    : {
        result: "distinct",
        message:
          "Active and recommended archive publication resources are materially distinct.",
      };
}
