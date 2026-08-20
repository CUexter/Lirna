import { z } from "zod";

import {
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "../../sep-admission/sep-admission-builders";

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
});

const admittedResource = z.object({
  role: sepResourceRoleSchema,
  requestedUrl: z.string(),
  finalUrl: z.string(),
  mediaType: z.string(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
  discoveryEdge: z.string(),
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
  resources: z.array(admittedResource),
});

export const sepAdmissionResultSchema = z.object({
  sourceId: z.string().uuid(),
  states: z.array(sepAdmittedStateSchema),
});
