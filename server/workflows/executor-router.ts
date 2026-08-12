import type { SourceHandlingPolicy } from "../artifacts/artifact-registry.js";

export interface SourceEvidence {
  readonly evidenceId: string;
  readonly policy: SourceHandlingPolicy;
}

export interface RetrievedEvidence extends SourceEvidence {
  readonly content: Buffer;
}

export interface OmittedEvidence {
  readonly evidenceId: string;
  readonly reason: string;
}

export interface ExecutorProfile {
  readonly executorId: string;
  readonly endpoint: string;
  readonly location: "local" | "cloud";
  readonly capabilities: ReadonlyArray<string>;
  readonly quality: number;
  readonly available: boolean;
  readonly latencyMs: number;
  readonly cost: number;
  readonly restrictedCloudEligible: boolean;
}

export function isSourceHandlingPolicy(
  value: unknown,
): value is SourceHandlingPolicy {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const policy = value as Partial<SourceHandlingPolicy>;
  return (
    (policy.sensitivity === "ordinary-cloud" ||
      policy.sensitivity === "restricted-cloud" ||
      policy.sensitivity === "local-only") &&
    (policy.rightsBasis === "owned" ||
      policy.rightsBasis === "lawfully-acquired" ||
      policy.rightsBasis === "publicly-accessible" ||
      policy.rightsBasis === "explicitly-licensed" ||
      policy.rightsBasis === "reference-only" ||
      policy.rightsBasis === "inaccessible")
  );
}

export interface RoutingRequirements {
  readonly capability: string;
  readonly qualityFloor: number;
  readonly localQualityTolerance: number;
  readonly maxLatencyMs: number;
  readonly budget: number;
  readonly preferredExecutorId?: string;
}

export interface RoutingChoice {
  readonly executorId: string;
  readonly endpoint: string;
  readonly consequences: string[];
}

export type RoutingDecision =
  | {
      readonly outcome: "selected";
      readonly executorId: string;
      readonly endpoint: string;
      readonly reason: string;
      readonly fallback: "none" | "automatic-equivalent";
      readonly fallbackFrom?: string;
      readonly disclosedEvidence: string[];
      readonly omittedEvidence: OmittedEvidence[];
    }
  | {
      readonly outcome: "paused";
      readonly reason: string;
      readonly fallbackFrom?: string;
      readonly choices: RoutingChoice[];
      readonly disclosedEvidence: string[];
      readonly omittedEvidence: OmittedEvidence[];
    };

export interface RetrievalPlan {
  readonly eligible: SourceEvidence[];
  readonly omitted: OmittedEvidence[];
}

export interface RouteCommand {
  readonly evidence: ReadonlyArray<SourceEvidence>;
  readonly executors: ReadonlyArray<ExecutorProfile>;
  readonly requirements: RoutingRequirements;
  readonly omittedEvidence: ReadonlyArray<OmittedEvidence>;
}

/**
 * Applies Source handling policy both before content retrieval and immediately
 * before endpoint selection. Routing returns an inspectable decision and never
 * sends bytes itself, so callers can record the actual endpoint before work.
 */
export class PolicyAwareExecutorRouter {
  prepareRetrieval(
    evidence: ReadonlyArray<SourceEvidence>,
    executors: ReadonlyArray<ExecutorProfile>,
  ): RetrievalPlan {
    const eligible: SourceEvidence[] = [];
    const omitted: OmittedEvidence[] = [];
    for (const item of evidence) {
      if (item.policy.rightsBasis === "inaccessible") {
        omitted.push({
          evidenceId: item.evidenceId,
          reason: "rights basis inaccessible prohibits content retrieval",
        });
      } else if (!executors.some((executor) => policyAllows(item.policy, executor))) {
        omitted.push({
          evidenceId: item.evidenceId,
          reason: "no configured executor is eligible under Source handling policy",
        });
      } else {
        eligible.push(item);
      }
    }
    return { eligible, omitted };
  }

  route(command: RouteCommand): RoutingDecision {
    const disclosedEvidence = command.evidence.map((item) => item.evidenceId);
    const preferred = command.requirements.preferredExecutorId
      ? command.executors.find(
          (executor) =>
            executor.executorId === command.requirements.preferredExecutorId,
        )
      : undefined;
    if (command.requirements.preferredExecutorId && !preferred) {
      return {
        outcome: "paused",
        reason: `Preferred executor ${command.requirements.preferredExecutorId} is not configured`,
        fallbackFrom: command.requirements.preferredExecutorId,
        choices: eligibleChoices(
          command.executors,
          command.evidence,
          command.requirements,
          undefined,
        ),
        disclosedEvidence,
        omittedEvidence: [...command.omittedEvidence],
      };
    }
    const eligible = command.executors.filter((executor) =>
      isEligible(executor, command.evidence, command.requirements),
    );
    const available = eligible.filter((executor) => executor.available);

    if (
      preferred &&
      (!preferred.available ||
        !isEligible(preferred, command.evidence, command.requirements))
    ) {
      const equivalent = available.find((executor) =>
        equivalentTo(preferred, executor, command.evidence),
      );
      if (equivalent) {
        return selected(
          equivalent,
          `Preferred executor ${preferred.executorId} is unavailable; ${equivalent.executorId} preserves policy, capability, quality, evidence, and budget`,
          "automatic-equivalent",
          disclosedEvidence,
          command.omittedEvidence,
          preferred.executorId,
        );
      }

      return {
        outcome: "paused",
        reason: `Preferred executor ${preferred.executorId} is unavailable or ineligible and no equivalent fallback remains`,
        fallbackFrom: preferred.executorId,
        choices: eligibleChoices(
          command.executors,
          command.evidence,
          command.requirements,
          preferred,
        ),
        disclosedEvidence,
        omittedEvidence: [...command.omittedEvidence],
      };
    }

    if (available.length === 0) {
      return {
        outcome: "paused",
        reason: "No available executor satisfies policy, capability, quality, latency, and budget",
        choices: [],
        disclosedEvidence,
        omittedEvidence: [...command.omittedEvidence],
      };
    }

    const bestQuality = Math.max(...available.map((executor) => executor.quality));
    const comparableLocal = available.find(
      (executor) =>
        executor.location === "local" &&
        executor.quality >= bestQuality - command.requirements.localQualityTolerance,
    );
    const chosen =
      comparableLocal ??
      [...available].sort(
        (a, b) => b.quality - a.quality || a.latencyMs - b.latencyMs || a.cost - b.cost,
      )[0]!;
    const reason = comparableLocal
      ? `Local executor ${chosen.executorId} is materially comparable to eligible alternatives`
      : `Executor ${chosen.executorId} best satisfies capability, quality, availability, latency, and budget`;
    return selected(
      chosen,
      reason,
      "none",
      disclosedEvidence,
      command.omittedEvidence,
    );
  }
}

function eligibleChoices(
  executors: ReadonlyArray<ExecutorProfile>,
  evidence: ReadonlyArray<SourceEvidence>,
  requirements: RoutingRequirements,
  preferred: ExecutorProfile | undefined,
): RoutingChoice[] {
  return executors
    .filter(
      (executor) =>
        executor.available &&
        executor.capabilities.includes(requirements.capability) &&
        executor.quality >= requirements.qualityFloor &&
        executor.latencyMs <= requirements.maxLatencyMs &&
        executor.cost <= requirements.budget,
    )
    .map((executor) => ({
      executorId: executor.executorId,
      endpoint: executor.endpoint,
      consequences: preferred
        ? consequences(preferred, executor, evidence)
        : evidence
            .filter((item) => !policyAllows(item.policy, executor))
            .map(
              (item) =>
                `${item.evidenceId} would be omitted by Source handling policy`,
            ),
    }));
}

function isEligible(
  executor: ExecutorProfile,
  evidence: ReadonlyArray<SourceEvidence>,
  requirements: RoutingRequirements,
): boolean {
  return (
    executor.capabilities.includes(requirements.capability) &&
    executor.quality >= requirements.qualityFloor &&
    executor.latencyMs <= requirements.maxLatencyMs &&
    executor.cost <= requirements.budget &&
    evidence.every((item) => policyAllows(item.policy, executor))
  );
}

function policyAllows(
  policy: SourceHandlingPolicy,
  executor: ExecutorProfile,
): boolean {
  if (policy.rightsBasis === "inaccessible") {
    return false;
  }
  if (policy.rightsBasis === "reference-only" && executor.location === "cloud") {
    return false;
  }
  if (policy.sensitivity === "local-only") {
    return executor.location === "local";
  }
  if (policy.sensitivity === "restricted-cloud" && executor.location === "cloud") {
    return executor.restrictedCloudEligible;
  }
  return true;
}

function equivalentTo(
  preferred: ExecutorProfile,
  fallback: ExecutorProfile,
  evidence: ReadonlyArray<SourceEvidence>,
): boolean {
  return (
    preferred.capabilities.every((capability) =>
      fallback.capabilities.includes(capability),
    ) &&
    fallback.quality >= preferred.quality &&
    fallback.cost <= preferred.cost &&
    evidence.every((item) => policyAllows(item.policy, fallback))
  );
}

function consequences(
  preferred: ExecutorProfile,
  fallback: ExecutorProfile,
  evidence: ReadonlyArray<SourceEvidence>,
): string[] {
  const result: string[] = [];
  if (fallback.quality < preferred.quality) {
    result.push(`quality falls from ${preferred.quality} to ${fallback.quality}`);
  }
  if (fallback.cost > preferred.cost) {
    result.push(`cost rises from ${preferred.cost} to ${fallback.cost}`);
  }
  for (const item of evidence) {
    if (!policyAllows(item.policy, fallback)) {
      result.push(
        `${item.evidenceId} would be omitted by Source handling policy`,
      );
    }
  }
  if (result.length === 0) {
    result.push("executor preference changes");
  }
  return result;
}

function selected(
  executor: ExecutorProfile,
  reason: string,
  fallback: "none" | "automatic-equivalent",
  disclosedEvidence: string[],
  omittedEvidence: ReadonlyArray<OmittedEvidence>,
  fallbackFrom?: string,
): RoutingDecision {
  return {
    outcome: "selected",
    executorId: executor.executorId,
    endpoint: executor.endpoint,
    reason,
    fallback,
    ...(fallbackFrom ? { fallbackFrom } : {}),
    disclosedEvidence,
    omittedEvidence: [...omittedEvidence],
  };
}
