export const findingCodes = [
  "archived-repository",
  "critical-vulnerability",
  "deprecated-release",
  "known-vulnerability",
  "lifecycle-scripts",
  "low-downloads",
  "missing-provenance",
  "missing-repository",
  "native-build-files",
  "repository-mismatch",
  "similar-name",
  "stale-release",
  "stale-repository",
  "young-package",
];

export function classifyAssessment(findings, policy) {
  if (
    !Number.isInteger(policy.policyVersion) ||
    policy.policyVersion < 1 ||
    !Number.isFinite(policy.highWarningBelow) ||
    !Number.isFinite(policy.warningBelow) ||
    policy.highWarningBelow < 0 ||
    policy.highWarningBelow > policy.warningBelow ||
    policy.warningBelow > 100
  )
    throw new Error("dependency assessment policy is invalid");
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

export function validateScorePolicy(policy) {
  if (
    !Number.isFinite(policy.minimumScore) ||
    policy.minimumScore < 0 ||
    policy.minimumScore > 100
  ) {
    throw new Error(
      "dependency score policy requires a minimumScore between 0 and 100",
    );
  }
  classifyAssessment(
    findingCodes.map((code) => ({ code, message: "policy validation" })),
    policy,
  );
}

export function criticalVulnerabilities(vulnerabilities) {
  return (vulnerabilities.vulns ?? [])
    .filter((vulnerability) =>
      [
        vulnerability.database_specific?.severity,
        vulnerability.ecosystem_specific?.severity,
        ...(vulnerability.severity ?? []).map((entry) => entry?.score),
      ].some(
        (value) =>
          typeof value === "string" &&
          (/(^|:)critical($|\/)/i.test(value) || cvssV3BaseScore(value) >= 9),
      ),
    )
    .map((vulnerability) => vulnerability.id ?? "unnamed OSV entry")
    .sort();
}

function cvssV3BaseScore(vector) {
  if (!vector.startsWith("CVSS:3.")) return Number.NaN;
  const metrics = Object.fromEntries(
    vector
      .split("/")
      .slice(1)
      .map((metric) => metric.split(":")),
  );
  const values = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
    AC: { L: 0.77, H: 0.44 },
    UI: { N: 0.85, R: 0.62 },
    CIA: { H: 0.56, L: 0.22, N: 0 },
  };
  const scopeChanged = metrics.S === "C";
  const privileges = scopeChanged
    ? { N: 0.85, L: 0.68, H: 0.5 }
    : { N: 0.85, L: 0.62, H: 0.27 };
  const [c, i, a] = ["C", "I", "A"].map((key) => values.CIA[metrics[key]]);
  const impactSubscore = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scopeChanged
    ? 7.52 * (impactSubscore - 0.029) - 3.25 * (impactSubscore - 0.02) ** 15
    : 6.42 * impactSubscore;
  const exploitability =
    8.22 *
    values.AV[metrics.AV] *
    values.AC[metrics.AC] *
    privileges[metrics.PR] *
    values.UI[metrics.UI];
  if (![impact, exploitability].every(Number.isFinite) || impact <= 0)
    return Number.NaN;
  const score = scopeChanged
    ? Math.min(10, 1.08 * (impact + exploitability))
    : Math.min(10, impact + exploitability);
  return Math.ceil(score * 10) / 10;
}

export function githubRepository(repository) {
  const value = repositoryValue(repository)
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git(?=#|$)/, "");
  const match = value.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/#]+)\/?(?:#.*)?$/i,
  );
  return match?.[1];
}

function repositoryValue(repository) {
  if (!repository) return "";
  return typeof repository === "string" ? repository : String(repository.url);
}
