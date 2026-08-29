import { z } from "zod";
import { readingSemanticLocationSchema } from "../../reading-position/reading-position-contract";
import { sepObservationKeySchema } from "../../sep-admission/sep-admission-builders";
import { sepReadingContractSchema } from "../../sep-admission/sep-reading-contract";
import { annotationSchema } from "./annotations";
import { citationResolutionSchema } from "./citation-resolution-schema";
import { sepAdmittedStateSchema } from "./sep-admission-schemas";

export const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});

export const sepLibrarySourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  admittedAt: z.string().datetime(),
  authors: z.array(z.string()),
  publisher: z.string(),
  publicationHistory: z.array(z.string()),
  kind: z.literal("sep"),
  stableKey: z.string().optional(),
  currentStateId: z.string().uuid().optional(),
  states: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      observationKey: sepObservationKeySchema,
      canonicalUrl: z.string(),
      title: z.string(),
      publisher: z.string(),
      admittedAt: z.string().datetime(),
    }),
  ),
});

export const notFoundError = { NOT_FOUND: {} };

export const readingPositionSchema = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
  sourceTitle: z.string(),
  componentIdentity: z.string(),
  componentLabel: z.string(),
  scrollTop: z.number().int().nonnegative(),
  semanticLocation: readingSemanticLocationSchema.optional(),
  savedAt: z.string().datetime(),
});

export const readingWorkspaceSchema = z.object({
  reading: sepReadingContractSchema,
  state: sepAdmittedStateSchema,
  source: sepLibrarySourceSchema,
  citationResolutions: z.array(citationResolutionSchema),
});

export const offlineWorkingSetSchema = z.object({
  manifest: z.object({
    version: z.literal(1),
    sourceId: z.string().uuid(),
    stateId: z.string().uuid(),
    synchronizedAt: z.string().datetime(),
    activeDerivative: z.object({
      id: z.string().uuid(),
      activationId: z.string().uuid(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      byteLength: z.number().int().nonnegative(),
    }),
    resources: z.array(
      z.object({
        identity: z.string(),
        role: z.string(),
        byteLength: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    ),
    replicaBytes: z.number().int().nonnegative(),
    referencedResourceBytes: z.number().int().nonnegative(),
    replicaSha256: z.string().regex(/^[0-9a-f]{64}$/),
    serverRetention: z.object({
      state: z.enum(["ready", "partial"]),
      reasons: z.array(z.string()),
    }),
    clientAvailability: z.object({
      state: z.literal("unknown"),
      reason: z.string(),
    }),
  }),
  replica: z.object({
    workspace: readingWorkspaceSchema,
    annotations: z.array(annotationSchema),
    positions: z.array(readingPositionSchema),
  }),
});
