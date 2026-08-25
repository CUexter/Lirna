import { z } from "zod";

import { sepReadingContractSchema } from "../sep-admission/sep-reading-contract";

const relocation = z.object({
  recordType: z.enum(["annotation", "reading-position", "citation-resolution"]),
  recordId: z.string(),
  classification: z.enum([
    "exact",
    "context-relocated",
    "ambiguous",
    "unresolved",
  ]),
  original: z.object({
    componentIdentity: z.string(),
    derivativeId: z.string().uuid().optional(),
  }),
  target: z
    .object({
      componentIdentity: z.string(),
      normalizedStartOffset: z.number().int().nonnegative().optional(),
      normalizedEndOffset: z.number().int().positive().optional(),
    })
    .optional(),
  candidates: z.number().int().nonnegative(),
  reason: z.string(),
});

export const derivativeComparisonSchema = z.object({
  baselineDerivativeId: z.string().uuid().optional(),
  semantic: z.object({
    changedComponents: z.array(
      z.object({
        identity: z.string(),
        beforeTextSha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        afterTextSha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
      }),
    ),
  }),
  structure: z.array(
    z.object({
      subject: z.enum(["components", "sections", "figures", "bibliography"]),
      before: z.number().int().nonnegative(),
      after: z.number().int().nonnegative(),
      beforeSha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
      afterSha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
  diagnostics: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
  relocations: z.array(relocation),
});

export const derivativeActivationSchema = z.object({
  id: z.string().uuid(),
  derivativeId: z.string().uuid(),
  actorId: z.string(),
  reason: z.string(),
  activatedAt: z.string().datetime(),
  consequences: derivativeComparisonSchema,
});

export const derivativeGenerationSchema = z.object({
  version: z.number().int().positive(),
  parser: z.object({ id: z.string(), version: z.string() }),
  renderer: z.object({ id: z.string(), version: z.string() }),
  inputResourceHashes: z.array(
    z.object({
      identity: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});

export const derivativeValidationSchema = z.object({
  status: z.enum(["valid", "invalid"]),
  checks: z.array(
    z.object({
      subject: z.enum([
        "typed-structure",
        "internal-targets",
        "component-resources",
        "notation",
        "figures",
        "footnotes",
        "bibliography",
        "diagnostics",
      ]),
      status: z.enum(["passed", "failed"]),
      messages: z.array(z.string()),
    }),
  ),
});

export const persistedDerivativeValidationSchema = z.union([
  derivativeValidationSchema.extend({
    comparison: derivativeComparisonSchema.optional(),
  }),
  z
    .object({ schema: z.literal("sep-reading-v1"), status: z.literal("valid") })
    .transform(() => ({
      status: "valid" as const,
      checks: [],
      comparison: undefined,
    })),
]);

export const readingDerivativeCandidateSchema = z.object({
  id: z.string().uuid(),
  sourceStateId: z.string().uuid(),
  kind: z.literal("sep-reading-v1"),
  previousDerivativeId: z.string().uuid().optional(),
  valid: z.boolean(),
  generation: derivativeGenerationSchema,
  validation: derivativeValidationSchema,
  comparison: derivativeComparisonSchema,
  reading: sepReadingContractSchema.optional(),
  createdAt: z.string().datetime(),
  currentActivation: derivativeActivationSchema.optional(),
});
