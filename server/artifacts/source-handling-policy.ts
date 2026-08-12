export {
  rightsBases,
  sensitivityLevels,
  type RightsBasis,
  type SensitivityLevel,
  type SourceHandlingPolicy,
} from "../shared/source-handling-policy.js";
import {
  rightsBases,
  sensitivityLevels,
  type RightsBasis,
  type SensitivityLevel,
  type SourceHandlingPolicy,
} from "../shared/source-handling-policy.js";

export function isSourceHandlingPolicy(value: unknown): value is SourceHandlingPolicy {
  if (value === null || typeof value !== "object") return false;
  const policy = value as Partial<SourceHandlingPolicy>;
  return (
    sensitivityLevels.includes(policy.sensitivity as SensitivityLevel) &&
    rightsBases.includes(policy.rightsBasis as RightsBasis)
  );
}

export function mostRestrictivePolicy(
  policies: readonly SourceHandlingPolicy[],
): SourceHandlingPolicy {
  if (policies.length === 0) {
    throw new TypeError("At least one Source handling policy is required");
  }
  return policies.reduce((effective, candidate) => ({
    sensitivity:
      sensitivityLevels.indexOf(candidate.sensitivity) >
      sensitivityLevels.indexOf(effective.sensitivity)
        ? candidate.sensitivity
        : effective.sensitivity,
    rightsBasis:
      rightsRestriction(candidate.rightsBasis) > rightsRestriction(effective.rightsBasis)
        ? candidate.rightsBasis
        : effective.rightsBasis,
  }));
}

function rightsRestriction(rightsBasis: RightsBasis): number {
  if (rightsBasis === "inaccessible") return 2;
  if (rightsBasis === "reference-only") return 1;
  return 0;
}
