export type SensitivityLevel = "ordinary-cloud" | "restricted-cloud" | "local-only";
export type RightsBasis =
  | "owned"
  | "lawfully-acquired"
  | "publicly-accessible"
  | "explicitly-licensed"
  | "reference-only"
  | "inaccessible";

export interface SourceHandlingPolicy {
  readonly sensitivity: SensitivityLevel;
  readonly rightsBasis: RightsBasis;
}

export const sensitivityLevels: readonly SensitivityLevel[] = [
  "ordinary-cloud",
  "restricted-cloud",
  "local-only",
];

export const rightsBases: readonly RightsBasis[] = [
  "owned",
  "lawfully-acquired",
  "publicly-accessible",
  "explicitly-licensed",
  "reference-only",
  "inaccessible",
];

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
