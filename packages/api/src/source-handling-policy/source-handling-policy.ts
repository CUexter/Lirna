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

export type OfflineRetentionDecision =
  | { allowed: true; reason: "eligible" }
  | {
      allowed: false;
      reasons: ContentAccessDenialReason[];
    };

type ContentAccessDenialReason =
  | "content-inaccessible"
  | "rights-reference-only";

export function decideOfflineRetention(
  policy: SourceHandlingPolicy,
): OfflineRetentionDecision {
  const denial = contentAccessDenialReason(policy.rightsBasis);
  if (denial) return { allowed: false, reasons: [denial] };
  return { allowed: true, reason: "eligible" };
}

function contentAccessDenialReason(
  rightsBasis: RightsBasis,
): ContentAccessDenialReason | undefined {
  if (rightsBasis === "inaccessible") return "content-inaccessible";
  if (rightsBasis === "reference-only") return "rights-reference-only";
}

export const processingEndpointClasses = [
  "ordinary-cloud",
  "restricted-cloud",
  "local",
] as const;
export type ProcessingEndpointClass =
  (typeof processingEndpointClasses)[number];
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

const endpointClassRank: Record<ProcessingEndpointClass, number> = {
  "ordinary-cloud": 0,
  "restricted-cloud": 1,
  local: 2,
};

export function decideContentProcessing(
  policy: SourceHandlingPolicy,
  endpointClass: ProcessingEndpointClass,
) {
  const reasons: ProcessingDenialReason[] = [];
  const contentAccessDenial = contentAccessDenialReason(policy.rightsBasis);
  if (contentAccessDenial) reasons.push(contentAccessDenial);

  if (
    endpointClassRank[endpointClass] < sensitivityRank[policy.sensitivityLevel]
  ) {
    reasons.push(
      policy.sensitivityLevel === "local-only"
        ? "requires-local-processing"
        : "requires-restricted-cloud",
    );
  }

  return reasons.length
    ? ({ allowed: false, reasons } as const)
    : ({ allowed: true, reason: "eligible" } as const);
}

export function decideCitationInference(
  policy: SourceHandlingPolicy,
  endpointClass: CitationInferenceRequest["endpointClass"],
): CitationInferenceDecision {
  const request: CitationInferenceRequest = {
    activity: "citation-candidate-inference",
    endpointClass,
  };
  const decision = decideContentProcessing(policy, endpointClass);
  return decision.allowed
    ? { allowed: true, request, reason: decision.reason }
    : { allowed: false, request, reasons: decision.reasons };
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
