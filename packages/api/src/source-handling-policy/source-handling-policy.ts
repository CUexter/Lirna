import { z } from "zod";

export const rightsBases = [
  "owned",
  "lawfully-acquired",
  "publicly-accessible",
  "explicitly-licensed",
  "reference-only",
  "inaccessible",
] as const;

export const sensitivityLevels = [
  "ordinary-cloud",
  "restricted-cloud",
  "local-only",
] as const;

export const rightsBasisSchema = z.enum(rightsBases);
export const sensitivityLevelSchema = z.enum(sensitivityLevels);
export const sourceHandlingPolicySchema = z.object({
  rightsBasis: rightsBasisSchema,
  sensitivityLevel: sensitivityLevelSchema,
});

export type RightsBasis = z.infer<typeof rightsBasisSchema>;
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;

export type SourceHandlingPolicy = z.infer<typeof sourceHandlingPolicySchema>;

export const processingEndpointClasses = [
  "ordinary-cloud",
  "restricted-cloud",
  "local",
] as const;
export const processingDenialReasons = [
  "content-inaccessible",
  "rights-reference-only",
  "requires-restricted-cloud",
  "requires-local-processing",
] as const;

export const citationInferenceRequestSchema = z.object({
  activity: z.literal("citation-candidate-inference"),
  endpointClass: z.enum(processingEndpointClasses),
});

export type CitationInferenceRequest = z.infer<
  typeof citationInferenceRequestSchema
>;

export const citationInferenceRequest = {
  activity: "citation-candidate-inference",
  endpointClass: "ordinary-cloud",
} as const satisfies CitationInferenceRequest;

export const citationInferenceDecisionSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    request: citationInferenceRequestSchema,
    reason: z.literal("eligible"),
  }),
  z.object({
    allowed: z.literal(false),
    request: citationInferenceRequestSchema,
    reasons: z.array(z.enum(processingDenialReasons)).min(1),
  }),
]);

export type ProcessingDenialReason = (typeof processingDenialReasons)[number];
export type CitationInferenceDecision = z.infer<
  typeof citationInferenceDecisionSchema
>;

const sensitivityRank: Record<SensitivityLevel, number> = {
  "ordinary-cloud": 0,
  "restricted-cloud": 1,
  "local-only": 2,
};

const endpointClassRank: Record<
  CitationInferenceRequest["endpointClass"],
  number
> = {
  "ordinary-cloud": 0,
  "restricted-cloud": 1,
  local: 2,
};

export function decideCitationInference(
  policy: SourceHandlingPolicy,
  endpointClass: CitationInferenceRequest["endpointClass"],
): CitationInferenceDecision {
  const request: CitationInferenceRequest = {
    activity: "citation-candidate-inference",
    endpointClass,
  };
  const reasons: ProcessingDenialReason[] = [];
  if (policy.rightsBasis === "inaccessible") {
    reasons.push("content-inaccessible");
  } else if (policy.rightsBasis === "reference-only") {
    reasons.push("rights-reference-only");
  }

  if (
    endpointClassRank[request.endpointClass] <
    sensitivityRank[policy.sensitivityLevel]
  ) {
    reasons.push(
      policy.sensitivityLevel === "local-only"
        ? "requires-local-processing"
        : "requires-restricted-cloud",
    );
  }

  return reasons.length
    ? { allowed: false, request, reasons }
    : { allowed: true, request, reason: "eligible" };
}

export function mostRestrictiveSensitivity(
  levels: readonly [SensitivityLevel, ...SensitivityLevel[]],
): SensitivityLevel {
  return levels.reduce((mostRestrictive, level) =>
    sensitivityRank[level] > sensitivityRank[mostRestrictive]
      ? level
      : mostRestrictive,
  );
}
