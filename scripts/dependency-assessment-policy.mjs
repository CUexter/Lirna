export const assessmentVersion = 2;

export function classifyAssessment(findings, policy) {
  if (!Number.isInteger(policy.policyVersion) || policy.policyVersion < 1) {
    throw new Error(
      "dependency assessment policy requires a positive policyVersion",
    );
  }
  if (
    !Number.isFinite(policy.highWarningBelow) ||
    !Number.isFinite(policy.warningBelow) ||
    policy.highWarningBelow < 0 ||
    policy.highWarningBelow > policy.warningBelow ||
    policy.warningBelow > 100
  ) {
    throw new Error(
      "dependency assessment policy has invalid confidence thresholds",
    );
  }
  if (!Array.isArray(findings))
    throw new Error("assessment findings must be an array");

  const scoredFindings = findings.map((finding) => {
    if (
      !finding ||
      typeof finding.code !== "string" ||
      typeof finding.message !== "string" ||
      !Number.isFinite(policy.confidenceDeductions?.[finding.code]) ||
      policy.confidenceDeductions[finding.code] < 0 ||
      policy.confidenceDeductions[finding.code] > 100
    ) {
      throw new Error(
        `assessment finding has no configured deduction: ${finding?.code ?? "unknown"}`,
      );
    }
    return { ...finding, deduction: policy.confidenceDeductions[finding.code] };
  });
  const confidenceScore = Math.max(
    0,
    100 -
      scoredFindings.reduce((total, finding) => total + finding.deduction, 0),
  );
  const confidenceTier =
    confidenceScore < policy.highWarningBelow
      ? "high-warning"
      : confidenceScore < policy.warningBelow
        ? "warning"
        : "normal";

  return {
    confidenceScore,
    confidenceTier,
    findings: scoredFindings,
    policyVersion: policy.policyVersion,
  };
}

export function validateAssessmentClassification(record, policy) {
  if (record.assessmentVersion !== assessmentVersion) {
    throw new Error(`assessmentVersion must be ${assessmentVersion}`);
  }
  const expected = classifyAssessment(record.findings, policy);
  if (
    record.policyVersion !== expected.policyVersion ||
    record.confidenceScore !== expected.confidenceScore ||
    record.confidenceTier !== expected.confidenceTier ||
    JSON.stringify(record.findings) !== JSON.stringify(expected.findings)
  ) {
    throw new Error(
      "recorded confidence classification does not match assessment policy",
    );
  }
}
