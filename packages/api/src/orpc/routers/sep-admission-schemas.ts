import { z } from "zod";
import {
  derivativeActivationSchema,
  derivativeComparisonSchema,
  derivativeGenerationSchema,
  derivativeValidationSchema,
} from "../../derivative-updates/derivative-update-schemas";
import {
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "../../sep-admission/sep-admission-builders";
import { admittedCaptureReportSchema } from "../../sep-admission/sep-admission-preview";

export {
  derivativeComparisonSchema,
  readingDerivativeCandidateSchema,
} from "../../derivative-updates/derivative-update-schemas";

const captureLimits = z.object({
  maxComponents: z.number().int().nonnegative(),
  maxAssets: z.number().int().nonnegative(),
  maxResourceBytes: z.number().int().nonnegative(),
  maxTotalBytes: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  maxRedirects: z.number().int().nonnegative(),
  timeoutMilliseconds: z.number().int().nonnegative(),
  maxConcurrency: z.number().int().positive(),
});

const previewResource = z.object({
  observationKey: sepObservationKeySchema,
  identity: z.string(),
  role: sepResourceRoleSchema,
  requestedUrl: z.string(),
  finalUrl: z.string(),
  status: z.number().int(),
  mediaType: z.string(),
  charset: z.string().optional(),
  contentEncoding: z.string().optional(),
  selectedHeaders: z.record(z.string(), z.string()),
  requestCount: z.number().int().nonnegative(),
  downloadedBytes: z.number().int().nonnegative(),
  retrievedAt: z.string().datetime(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
  discoveryEdge: z.string(),
  depth: z.number().int().nonnegative(),
});

export const sepAdmissionPreviewSchema = z.object({
  id: z.string().uuid(),
  stableKey: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string(),
  publicationHistory: z.array(z.string()),
  submittedUrl: z.string(),
  recommendedArchiveUrl: z.string().optional(),
  policy: z.object({
    rightsBasis: z.literal("publicly-accessible"),
    sensitivityLevel: z.literal("ordinary-cloud"),
  }),
  metrics: z.object({
    requests: z.number().int().nonnegative(),
    downloadedBytes: z.number().int().nonnegative(),
    retainedBytes: z.number().int().nonnegative(),
    processingMilliseconds: z.number().nonnegative(),
  }),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  diagnostics: z.array(
    z.object({
      level: z.enum(["info", "warning"]),
      code: z.string(),
      message: z.string(),
    }),
  ),
  capture: z.object({
    budget: z.enum(["standard", "expanded"]),
    completeness: z.enum(["complete", "partial", "stopped"]),
    readingReadiness: z.enum(["ready", "degraded"]),
    readinessReasons: z.array(z.string()),
    unresolvedResources: z.array(
      z.object({
        url: z.string(),
        parentIdentity: z.string(),
        role: sepResourceRoleSchema,
        depth: z.number().int().nonnegative(),
        reason: z.string(),
        limit: z.boolean(),
      }),
    ),
    limits: captureLimits,
    retryUsed: z.boolean(),
    retryAvailable: z.boolean(),
  }),
  resources: z.array(previewResource),
  observations: z.array(
    z.object({
      key: sepObservationKeySchema,
      label: z.enum(["Active", "Recommended archive"]),
      canonicalUrl: z.string(),
      resources: z.array(previewResource),
    }),
  ),
  comparison: z.object({
    result: z.enum(["equivalent", "distinct", "active-only"]),
    message: z.string(),
  }),
  update: z
    .object({
      sourceId: z.string().uuid(),
      observations: z.array(
        z.object({
          key: sepObservationKeySchema,
          result: z.enum(["unchanged", "changed", "new"]),
          comparedStateId: z.string().uuid().optional(),
        }),
      ),
    })
    .optional(),
});

const admittedResource = z.object({
  identity: z.string(),
  role: sepResourceRoleSchema,
  requestedUrl: z.string(),
  finalUrl: z.string(),
  status: z.number().int(),
  mediaType: z.string(),
  charset: z.string().optional(),
  contentEncoding: z.string().optional(),
  selectedHeaders: z.record(z.string(), z.string()),
  requestCount: z.number().int().positive(),
  downloadedBytes: z.number().int().nonnegative(),
  retrievedAt: z.string().datetime(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
  discoveryEdge: z.string(),
  depth: z.number().int().nonnegative(),
});

const diagnostic = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
});

export const sepAdmittedStateSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  observationKey: sepObservationKeySchema,
  canonicalUrl: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string(),
  publicationHistory: z.array(z.string()),
  admittedAt: z.string().datetime(),
  policy: z.object({
    rightsBasis: z.string(),
    sensitivityLevel: z.string(),
  }),
  diagnostics: z.array(diagnostic),
  capture: admittedCaptureReportSchema,
  resources: z.array(admittedResource),
  components: z.array(
    z.object({
      identity: z.string(),
      role: sepResourceRoleSchema,
      label: z.string(),
      order: z.number().int().nonnegative(),
      parentIdentity: z.string().optional(),
      requestedUrl: z.string(),
      finalUrl: z.string(),
      retrievedAt: z.string().datetime(),
      sha256: z.string(),
    }),
  ),
  derivatives: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.string(),
      previousDerivativeId: z.string().uuid().optional(),
      valid: z.boolean(),
      generation: derivativeGenerationSchema,
      validation: derivativeValidationSchema,
      comparison: derivativeComparisonSchema.optional(),
      createdAt: z.string().datetime(),
      currentActivation: z
        .object({
          id: z.string().uuid(),
          derivativeId: z.string().uuid(),
          actorId: z.string(),
          reason: z.string(),
          activatedAt: z.string().datetime(),
          consequences: derivativeComparisonSchema,
        })
        .optional(),
      activationHistory: z.array(derivativeActivationSchema),
      provenance: z
        .object({
          adapter: z.object({ id: z.string(), version: z.string() }),
          parser: z.object({ id: z.string(), version: z.string() }),
          inputResourceHashes: z.array(
            z.object({ identity: z.string(), sha256: z.string() }),
          ),
        })
        .optional(),
    }),
  ),
});

export const sepAdmissionResultSchema = z.object({
  sourceId: z.string().uuid(),
  states: z.array(sepAdmittedStateSchema),
  outcomes: z.array(
    z.object({
      observationKey: sepObservationKeySchema,
      stateId: z.string().uuid(),
      disposition: z.enum(["created", "unchanged"]),
    }),
  ),
});
