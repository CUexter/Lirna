import { githubRepository } from "./dependency-score-policy.mjs";

export function assessmentFindings(signals) {
  return [
    ...registryFindings(signals),
    ...freshnessFindings(signals),
    ...repositoryFindings(signals),
    ...similarNameFindings(signals),
    ...vulnerabilityFindings(signals),
  ].filter(Boolean);
}

function registryFindings({
  deprecated,
  lifecycleScripts,
  nativeBuildFiles,
  policy,
  provenance,
  repository,
}) {
  return [
    policy.warnOnDeprecation && deprecated
      ? finding(
          "deprecated-release",
          `exact release is deprecated: ${deprecated}`,
        )
      : undefined,
    policy.warnOnLifecycleScripts && lifecycleScripts.length > 0
      ? finding("lifecycle-scripts", "archive declares lifecycle scripts")
      : undefined,
    policy.warnOnNativeBuildFiles && nativeBuildFiles.length > 0
      ? finding(
          "native-build-files",
          "archive contains implicit native-build files",
        )
      : undefined,
    policy.warnOnMissingRepository && !repository
      ? finding("missing-repository", "no source repository is declared")
      : undefined,
    policy.warnOnMissingProvenance && !provenance
      ? finding("missing-provenance", "registry provenance is unavailable")
      : undefined,
  ];
}

function freshnessFindings({
  downloads,
  now,
  packageCreated,
  policy,
  releasePublished,
}) {
  return [
    ageInDays(now, packageCreated) < policy.maximumPackageAgeDaysWithoutReview
      ? finding(
          "young-package",
          `package is younger than ${policy.maximumPackageAgeDaysWithoutReview} days`,
        )
      : undefined,
    ageInDays(now, releasePublished) > policy.maximumReleaseStalenessDays
      ? finding(
          "stale-release",
          `exact release is older than ${policy.maximumReleaseStalenessDays} days`,
        )
      : undefined,
    downloads.downloads < policy.minimumLastMonthDownloads
      ? finding(
          "low-downloads",
          `last-month downloads are below ${policy.minimumLastMonthDownloads}`,
        )
      : undefined,
  ];
}

function repositoryFindings({ now, policy, repository, sourceRepository }) {
  return [
    policy.warnOnArchivedRepository && sourceRepository?.archived
      ? finding("archived-repository", "declared source repository is archived")
      : undefined,
    policy.warnOnRepositoryMismatch &&
    sourceRepository &&
    ageInDays(now, sourceRepository.pushed_at) >
      policy.maximumRepositoryStalenessDays
      ? finding(
          "stale-repository",
          `declared source repository has no recent push within ${policy.maximumRepositoryStalenessDays} days`,
        )
      : undefined,
    sourceRepository &&
    sourceRepository.full_name.toLowerCase() !==
      githubRepository(repository)?.toLowerCase()
      ? finding(
          "repository-mismatch",
          "declared source repository does not match repository metadata",
        )
      : undefined,
  ];
}

function similarNameFindings({ name, now, policy, similarNames }) {
  return [
    policy.warnOnSimilarEstablishedNames &&
    similarNames.some(
      (candidate) =>
        candidate.name !== name &&
        candidate.name &&
        similarlyNamed(name, candidate.name) &&
        candidate.date &&
        ageInDays(now, candidate.date) >= policy.minimumSimilarPackageAgeDays,
    )
      ? finding(
          "similar-name",
          "registry search returned similarly named established packages",
        )
      : undefined,
  ];
}

function vulnerabilityFindings({
  criticalVulnerabilityIds,
  policy,
  vulnerabilities,
}) {
  if (!policy.warnOnVulnerabilities) return [];
  const criticalIds = new Set(criticalVulnerabilityIds);
  return (vulnerabilities.vulns ?? []).map((vulnerability) => {
    const id = vulnerability.id ?? "unnamed OSV entry";
    return criticalIds.has(id)
      ? finding("critical-vulnerability", `critical vulnerability: ${id}`)
      : finding("known-vulnerability", `known vulnerability: ${id}`);
  });
}

function similarlyNamed(name, candidate) {
  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/^@[^/]+\//, "")
      .replace(/[^a-z0-9]/g, "");
  const left = normalize(name);
  const right = normalize(candidate);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  if (Math.abs(left.length - right.length) > 2) return false;

  const distances = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = distances[0];
    distances[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = distances[rightIndex];
      distances[rightIndex] = Math.min(
        distances[rightIndex] + 1,
        distances[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return distances[right.length] <= 2;
}

function ageInDays(now, date) {
  const difference = new Date(now).getTime() - new Date(date).getTime();
  return Number.isFinite(difference) ? difference / 86_400_000 : Number.NaN;
}

function finding(code, message) {
  return { code, message };
}
