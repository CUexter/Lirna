#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assessmentVersion,
  classifyAssessment,
} from "./dependency-assessment-policy.mjs";
import { decisionPath } from "./dependency-decisions.mjs";

const exec = promisify(execFile);
const lifecycleNames = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
]);

async function main() {
  const { request, section } = dependencyRequest(process.argv.slice(2));
  if (!request) {
    throw new Error(
      "usage: npm run dependency:add -- [--dev|--optional|--peer] <one-package-request>",
    );
  }
  const projectRoot =
    process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();
  const registry = normalizeBaseUrl(
    process.env.LIRNA_NPM_REGISTRY ??
      process.env.npm_config_registry ??
      "https://registry.npmjs.org/",
  );
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "lirna-dependency-assessment-"),
  );
  const cache = join(temporaryRoot, "npm-cache");
  const archivePath = join(temporaryRoot, "package.tgz");
  const policy = JSON.parse(await readFile(policyPath(), "utf8"));

  try {
    const selectedVersion = lastValue(
      await npmJson(
        [
          "view",
          request,
          "version",
          "--json",
          "--registry",
          registry,
          "--cache",
          cache,
        ],
        temporaryRoot,
      ),
    );
    const requestedName = packageName(request);
    const resolved = await npmJson(
      [
        "view",
        `${requestedName}@${requiredString(selectedVersion, "resolved package version")}`,
        "--json",
        "--registry",
        registry,
        "--cache",
        cache,
      ],
      temporaryRoot,
    );
    const name = requiredString(resolved.name, "resolved package name");
    const version = requiredString(
      resolved.version,
      "resolved package version",
    );
    if (name !== requestedName) {
      throw new Error(
        `registry resolved ${request} to unexpected package identity ${name}`,
      );
    }
    const packument = await fetchJson(
      new URL(encodeURIComponent(name), registry),
    );
    const release = packument.versions?.[version];
    if (!release || typeof release !== "object") {
      throw new Error(
        `registry metadata does not contain resolved release ${name}@${version}`,
      );
    }

    const tarballUrl = requiredString(
      release.dist?.tarball,
      "release tarball URL",
    );
    const archive = await fetchBytes(new URL(tarballUrl));
    verifyRegistryIntegrity(archive, release.dist);
    await writeFile(archivePath, archive);

    // These tar operations only list entries and stream one file to stdout. No
    // package content is extracted, imported, or executed during assessment.
    const { stdout: listing } = await exec("tar", ["-tzf", archivePath], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const entries = listing.split("\n").filter(Boolean);
    if (!entries.includes("package/package.json")) {
      throw new Error("verified package archive has no package/package.json");
    }
    const { stdout: manifestText } = await exec(
      "tar",
      ["-xOzf", archivePath, "package/package.json"],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const manifest = JSON.parse(manifestText);
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(
        `verified archive identifies itself as ${show(manifest.name)}@${show(manifest.version)}, expected ${name}@${version}`,
      );
    }
    const lifecycleScripts = Object.entries(manifest.scripts ?? {})
      .filter(([script]) => lifecycleNames.has(script))
      .map(([script, command]) => `${script}: ${String(command)}`);
    const nativeBuildFiles = entries.filter((entry) =>
      /(^|\/)(binding\.gyp|\.node-gyp|CMakeLists\.txt|[^/]+\.node)$/.test(
        entry,
      ),
    );

    const repository = release.repository ?? packument.repository;
    const declaredRepository = githubRepository(repository);
    const [search, provenance, downloads, vulnerabilities, sourceRepository] =
      await Promise.all([
        fetchJson(
          new URL(
            `-/v1/search?text=${encodeURIComponent(name)}&size=10`,
            registry,
          ),
        ),
        optionalJson(
          new URL(
            `-/npm/v1/attestations/${encodeURIComponent(`${name}@${version}`)}`,
            registry,
          ),
        ),
        fetchJson(downloadUrl(name)),
        osvVulnerabilities(name, version),
        declaredRepository
          ? fetchJson(githubUrl(declaredRepository))
          : undefined,
      ]);
    const similarNames = (search.objects ?? [])
      .map((entry) => entry?.package)
      .filter(Boolean);
    const scorecard = declaredRepository
      ? await optionalJson(scorecardUrl(declaredRepository))
      : undefined;
    const releaseYears = releaseActivityByYear(
      packument.time,
      packument.versions,
    );
    const criticalVulnerabilityIds = criticalVulnerabilities(vulnerabilities);
    const classification = classifyAssessment(
      assessmentFindings({
        deprecated: release.deprecated,
        downloads,
        criticalVulnerabilityIds,
        lifecycleScripts,
        name,
        nativeBuildFiles,
        now: assessmentNow(),
        packageCreated: packument.time?.created,
        policy,
        provenance,
        repository,
        sourceRepository,
        releasePublished: packument.time?.[version],
        similarNames,
        vulnerabilities,
      }),
      policy,
    );

    printReport({
      archive,
      downloads,
      entries,
      lifecycleScripts,
      manifest,
      name,
      nativeBuildFiles,
      packument,
      provenance,
      classification,
      scorecard,
      sourceRepository,
      release,
      releaseYears,
      request,
      similarNames,
      vulnerabilities,
      version,
    });

    await exec(
      "npm",
      ["cache", "add", archivePath, "--cache", cache, "--ignore-scripts"],
      {
        cwd: temporaryRoot,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    // Prime the isolated cache with the assessed package's dependency tree before
    // the final offline install into the project. Lifecycle scripts stay disabled.
    await exec(
      "npm",
      [
        "install",
        archivePath,
        "--ignore-scripts",
        "--no-package-lock",
        "--registry",
        registry,
        "--cache",
        cache,
      ],
      { cwd: temporaryRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    await exec(
      "npm",
      [
        "install",
        `${name}@${version}`,
        "--save-exact",
        ...installSectionFlag(section),
        "--ignore-scripts",
        "--registry",
        registry,
        "--cache",
        cache,
      ],
      { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    const installedIntegrity = await assertInstalledArtifact(
      projectRoot,
      name,
      version,
      release.dist?.integrity,
    );
    if (!archiveMatchesIntegrity(archive, installedIntegrity)) {
      throw new Error(
        `installed lockfile integrity does not match assessed ${name}@${version}`,
      );
    }
    await writeAssessmentEvidence({
      archiveSha512: createHash("sha512").update(archive).digest("base64"),
      classification,
      integrity: installedIntegrity,
      name,
      projectRoot,
      section,
      tarballUrl,
      version,
    });
    printConfidenceWarning(name, version, classification);
    console.log(
      `\nInstalled ${name}@${version} with lifecycle scripts disabled.`,
    );
    if (lifecycleScripts.length > 0 || nativeBuildFiles.length > 0) {
      console.log(
        `package scripts remain disabled for ${name}@${version}; record an exact script justification and run npm run dependency:run-scripts -- ${name}@${version} only if those capabilities are required.`,
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function npmJson(args, cwd) {
  const { stdout } = await exec("npm", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `required registry request failed (${response.status} ${url})`,
    );
  }
  return response.json();
}

async function optionalJson(url) {
  try {
    return await fetchJson(url);
  } catch {
    return undefined;
  }
}

async function osvVulnerabilities(name, version) {
  const url = osvUrl();
  const result = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ package: { ecosystem: "npm", name }, version }),
  });
  if (!result.ok) {
    throw new Error(`required OSV request failed (${result.status} ${url})`);
  }
  return result.json();
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `package archive request failed (${response.status} ${url})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

function verifyRegistryIntegrity(archive, dist) {
  const candidates = String(dist?.integrity ?? "")
    .split(/\s+/)
    .map((value) => value.match(/^(sha512|sha384|sha256|sha1)-(.+)$/))
    .filter(Boolean);
  if (candidates.length === 0 && typeof dist?.shasum === "string") {
    candidates.push([
      dist.shasum,
      "sha1",
      Buffer.from(dist.shasum, "hex").toString("base64"),
    ]);
  }
  if (candidates.length === 0) {
    throw new Error(
      "registry release has no supported archive integrity evidence",
    );
  }
  const verified = candidates.some(([, algorithm, expectedBase64]) =>
    archiveMatchesIntegrity(archive, `${algorithm}-${expectedBase64}`),
  );
  if (!verified) {
    throw new Error(
      "package archive integrity does not match registry evidence",
    );
  }
}

function archiveMatchesIntegrity(archive, integrity) {
  return String(integrity)
    .split(/\s+/)
    .map((value) => value.match(/^(sha512|sha384|sha256|sha1)-(.+)$/))
    .filter(Boolean)
    .some(([, algorithm, expectedBase64]) => {
      const actual = createHash(algorithm).update(archive).digest();
      const expected = Buffer.from(expectedBase64, "base64");
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    });
}

function releaseActivityByYear(times = {}, versions = {}) {
  const counts = new Map();
  for (const version of Object.keys(versions)) {
    const date = times[version];
    if (typeof date !== "string") continue;
    const year = new Date(date).getUTCFullYear();
    if (Number.isFinite(year)) counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left - right);
}

function assessmentFindings({
  criticalVulnerabilityIds,
  deprecated,
  downloads,
  lifecycleScripts,
  name,
  nativeBuildFiles,
  now,
  packageCreated,
  policy,
  provenance,
  repository,
  sourceRepository,
  releasePublished,
  similarNames,
  vulnerabilities,
}) {
  const criticalIds = new Set(criticalVulnerabilityIds);
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
    ...(policy.warnOnVulnerabilities
      ? (vulnerabilities.vulns ?? []).map((vulnerability) => {
          const id = vulnerability.id ?? "unnamed OSV entry";
          return criticalIds.has(id)
            ? finding("critical-vulnerability", `critical vulnerability: ${id}`)
            : finding("known-vulnerability", `known vulnerability: ${id}`);
        })
      : []),
  ].filter(Boolean);
}

function finding(code, message) {
  return { code, message };
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

function criticalVulnerabilities(vulnerabilities) {
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
  const impactSubscore =
    1 -
    (1 - values.CIA[metrics.C]) *
      (1 - values.CIA[metrics.I]) *
      (1 - values.CIA[metrics.A]);
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

function printReport(evidence) {
  const repository =
    evidence.release.repository ?? evidence.packument.repository;
  const author = evidence.release.author ?? evidence.packument.author;
  const maintainers =
    evidence.packument.maintainers ?? evidence.release.maintainers;
  const publisher = evidence.release._npmUser;
  console.log(
    `Dependency artifact assessment: ${evidence.name}@${evidence.version}`,
  );
  console.log("\nRegistry-observed facts");
  console.log(`  Request: ${evidence.request}`);
  console.log(`  Exact selected release: ${evidence.name}@${evidence.version}`);
  console.log(`  Package created: ${show(evidence.packument.time?.created)}`);
  console.log(
    `  Exact release published: ${show(evidence.packument.time?.[evidence.version])}`,
  );
  console.log(
    `  Last registry update: ${show(evidence.packument.time?.modified)}`,
  );
  console.log(
    `  Release activity by year: ${evidence.releaseYears.map(([year, count]) => `${year}: ${count}`).join(", ") || "unavailable"}`,
  );
  console.log(
    `  Deprecation: ${show(evidence.release.deprecated, "none declared")}`,
  );
  console.log(
    `  Archive integrity: verified (${show(evidence.release.dist?.integrity)})`,
  );
  console.log(`  Archive bytes inspected: ${evidence.archive.byteLength}`);
  console.log(
    "\nSelf-declared npm identity (unverified; maintainer history is unavailable)",
  );
  console.log(`  Declared author: ${identity(author)}`);
  console.log(`  Current maintainers: ${identityList(maintainers)}`);
  console.log(`  Exact-version publisher: ${identity(publisher)}`);
  console.log(`  Repository declaration: ${repositoryValue(repository)}`);
  console.log(
    "\nArchive-observed static evidence (verified bytes; nothing executed)",
  );
  console.log(
    `  Lifecycle scripts: ${evidence.lifecycleScripts.join("; ") || "none"}`,
  );
  console.log(
    `  Implicit native-build files: ${evidence.nativeBuildFiles.join(", ") || "none"}`,
  );
  console.log(`  Archive entries: ${evidence.entries.length}`);
  console.log("\nAvailability and activity evidence (not trust evidence)");
  console.log(
    `  Registry provenance: ${evidence.provenance ? "available (registry-reported)" : "unavailable or unverified"}`,
  );
  console.log(`  Last-month downloads: ${show(evidence.downloads?.downloads)}`);
  console.log(
    `  Similarly named packages: ${
      evidence.similarNames
        .map((candidate) => candidate.name)
        .filter(Boolean)
        .join(", ") || "none available"
    }`,
  );
  console.log("\nIndependently observed source evidence");
  console.log(
    `  Declared repository owner: ${show(evidence.sourceRepository?.owner?.login)}`,
  );
  console.log(
    `  Declared repository activity: ${show(evidence.sourceRepository?.pushed_at)}`,
  );
  console.log(
    `  Declared repository archived: ${show(evidence.sourceRepository?.archived, "unavailable")}`,
  );
  console.log(
    `  OpenSSF Scorecard: ${evidence.scorecard ? "available (unverified external evidence)" : "unavailable or unverified"}`,
  );
  console.log(
    `  OSV vulnerabilities: ${(evidence.vulnerabilities.vulns ?? []).map((vulnerability) => vulnerability.id).join(", ") || "none reported"}`,
  );
  console.log("\nAutomated confidence classification");
  console.log(
    `  Confidence score: ${evidence.classification.confidenceScore}/100 (${evidence.classification.confidenceTier})`,
  );
  for (const finding of evidence.classification.findings) {
    console.log(`  - ${finding.message} (-${finding.deduction})`);
  }
  if (evidence.classification.findings.length === 0)
    console.log("  Findings: none");
}

function printConfidenceWarning(name, version, classification) {
  if (classification.confidenceTier === "normal") return;
  console.log(
    `\nWARNING: ${name}@${version} confidence score ${classification.confidenceScore}/100 (${classification.confidenceTier}).`,
  );
  console.log(
    "No override is required; exact assessment evidence was recorded.",
  );
}

async function assertInstalledArtifact(projectRoot, name, version, integrity) {
  const lock = JSON.parse(
    await readFile(join(projectRoot, "package-lock.json"), "utf8"),
  );
  const installed = lock.packages?.[`node_modules/${name}`];
  if (
    installed?.version !== version ||
    typeof installed.integrity !== "string" ||
    (integrity && installed.integrity !== integrity)
  ) {
    throw new Error(
      `installed lockfile artifact does not match assessed ${name}@${version}`,
    );
  }
  return installed.integrity;
}

async function writeAssessmentEvidence({
  archiveSha512,
  classification,
  integrity,
  name,
  projectRoot,
  section,
  tarballUrl,
  version,
}) {
  const path = decisionPath(projectRoot, name, version, "assessment");
  await mkdir(join(projectRoot, "config", "dependency-decisions"), {
    recursive: true,
  });
  await writeFile(
    path,
    `${JSON.stringify({ archiveSha512, assessmentDate: assessmentNow(), assessmentVersion, ...classification, integrity, package: name, section, tarballUrl, version }, null, 2)}\n`,
  );
  console.log(`Recorded exact assessment evidence at ${path}.`);
}

function dependencyRequest(args) {
  const sections = {
    "--dev": "devDependencies",
    "--optional": "optionalDependencies",
    "--peer": "peerDependencies",
  };
  const flags = args.filter((value) => value.startsWith("-"));
  const requests = args.filter((value) => !value.startsWith("-"));
  if (
    flags.length > 1 ||
    requests.length !== 1 ||
    (flags[0] && !sections[flags[0]])
  ) {
    return {};
  }
  return {
    request: requests[0],
    section: flags[0] ? sections[flags[0]] : "dependencies",
  };
}

function installSectionFlag(section) {
  return {
    dependencies: [],
    devDependencies: ["--save-dev"],
    optionalDependencies: ["--save-optional"],
    peerDependencies: ["--save-peer"],
  }[section];
}

function downloadUrl(name) {
  const base = normalizeBaseUrl(
    process.env.LIRNA_NPM_DOWNLOADS_URL ??
      "https://api.npmjs.org/downloads/point/last-month/",
  );
  return new URL(encodeURIComponent(name), base);
}

function osvUrl() {
  return process.env.LIRNA_OSV_URL ?? "https://api.osv.dev/v1/query";
}

function githubUrl(repository) {
  const base = normalizeBaseUrl(
    process.env.LIRNA_GITHUB_API_URL ?? "https://api.github.com/repos/",
  );
  return new URL(repository, base);
}

function scorecardUrl(repository) {
  const base = normalizeBaseUrl(
    process.env.LIRNA_SCORECARD_API_URL ??
      "https://api.securityscorecards.dev/projects/",
  );
  return new URL(`github.com/${repository}`, base);
}

function githubRepository(repository) {
  const value = repositoryValue(repository)
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git(?=#|$)/, "");
  const match = value.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/#]+)\/?(?:#.*)?$/i,
  );
  return match?.[1];
}

function assessmentNow() {
  return process.env.LIRNA_ASSESSMENT_NOW ?? new Date().toISOString();
}

function ageInDays(now, date) {
  const difference = new Date(now).getTime() - new Date(date).getTime();
  return Number.isFinite(difference) ? difference / 86_400_000 : Number.NaN;
}

function policyPath() {
  return fileURLToPath(
    new URL("../config/dependency-assessment-policy.json", import.meta.url),
  );
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`missing ${label}`);
  return value;
}

function lastValue(value) {
  return Array.isArray(value) ? value.at(-1) : value;
}

function packageName(request) {
  if (request.startsWith("@")) {
    const separator = request.indexOf("@", 1);
    return separator === -1 ? request : request.slice(0, separator);
  }
  const separator = request.indexOf("@");
  return separator === -1 ? request : request.slice(0, separator);
}

function show(value, fallback = "unavailable") {
  return value === undefined || value === null || value === ""
    ? fallback
    : String(value);
}

function identity(value) {
  if (!value) return "unavailable";
  if (typeof value === "string") return value;
  return (
    [value.name, value.email].filter(Boolean).join(" <") +
    (value.email ? ">" : "")
  );
}

function identityList(values) {
  return Array.isArray(values) && values.length > 0
    ? values.map(identity).join(", ")
    : "unavailable";
}

function repositoryValue(repository) {
  if (!repository) return "unavailable";
  return typeof repository === "string" ? repository : show(repository.url);
}

main().catch((error) => {
  console.error(
    `Dependency assessment failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
