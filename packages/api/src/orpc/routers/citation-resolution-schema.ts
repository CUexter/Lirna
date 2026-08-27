import { z } from "zod";

import { authoredTargetSchema } from "../../authored-targets/authored-target";
import {
  citationEvidenceStates,
  citationResolutionActions,
  citationResolutionMethods,
} from "../../citation-resolutions/citation-resolution-contract";
import {
  citationInferenceDecisionSchema,
  sourceHandlingPolicySchema,
} from "../../source-handling-policy/source-handling-policy";

const resolutionBase = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceStateId: z.string().uuid(),
  derivativeId: z.string().uuid(),
  componentIdentity: z.string(),
  mentionId: z.string(),
  ...authoredTargetSchema.shape,
  actorId: z.string(),
  method: z.enum(citationResolutionMethods),
  confidence: z.number().min(0).max(1).nullable(),
  reasoning: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const citationResolutionSchema = resolutionBase.extend({
  bibliographyComponentIdentity: z.string(),
  bibliographyEntryId: z.string(),
});

export const citationResolutionDecisionSchema = resolutionBase.extend({
  action: z.enum(citationResolutionActions),
  bibliographyComponentIdentity: z.string().nullable(),
  bibliographyEntryId: z.string().nullable(),
});

export const citationMentionEvidenceSchema = z.object({
  id: z.string(),
  sourceId: z.string().uuid(),
  sourceStateId: z.string().uuid(),
  derivativeId: z.string().uuid(),
  componentIdentity: z.string(),
  mentionId: z.string(),
  label: z.string(),
  context: z.string(),
  state: z.enum(citationEvidenceStates),
  deterministicReason: z.string(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        bibliographyComponentIdentity: z.string(),
        bibliographyEntryId: z.string(),
        label: z.string(),
        text: z.string(),
        reason: z.string(),
      }),
    )
    .max(12),
  policy: sourceHandlingPolicySchema.extend({
    citationInference: citationInferenceDecisionSchema,
  }),
});
