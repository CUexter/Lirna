#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  decisionPath,
  lastCommitAuthor,
  readCommittedDecision,
  validateExactDecision,
  validateOfficialSourceUrl,
} from "./dependency-decisions.mjs";

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
  const projectRoot = process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();
  const registry = normalizeBaseUrl(
    process.env.LIRNA_NPM_REGISTRY ??
      process.env.npm_config_registry ??
      "https://registry.npmjs.org/",
  );
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-dependency-assessment-"));
  const cache = join(temporaryRoot, "npm-cache");
  const archivePath = join(temporaryRoot, "package.tgz");
  const policy = JSON.parse(await readFile(policyPath(), "utf8"));

  try {
    const selectedVersion = lastValue(
      await npmJson(
        ["view", request, "version", "--json", "--registry", registry, "--cache", cache],
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
    const version = requiredString(resolved.version, "resolved package version");
    if (name !== requestedName) {
      throw new Error(`registry resolved ${request} to unexpected package identity ${name}`);
    }
    const packument = await fetchJson(new URL(encodeURIComponent(name), registry));
    const release = packument.versions?.[version];
    if (!release || typeof release !== "object") {
      throw new Error(`registry metadata does not contain resolved release ${name}@${version}`);
    }

    const tarballUrl = requiredString(release.dist?.tarball, "release tarball URL");
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
      /(^|\/)(binding\.gyp|\.node-gyp|CMakeLists\.txt|[^/]+\.node)$/.test(entry),
    );

    const repository = release.repository ?? packument.repository;
    const declaredRepository = githubRepository(repository);
    const [search, provenance, downloads, vulnerabilities, sourceRepository] = await Promise.all([
      fetchJson(new URL(`-/v1/search?text=${encodeURIComponent(name)}&size=10`, registry)),
      optionalJson(
        new URL(`-/npm/v1/attestations/${encodeURIComponent(`${name}@${version}`)}`, registry),
      ),
      fetchJson(downloadUrl(name)),
      osvVulnerabilities(name, version),
      declaredRepository ? fetchJson(githubUrl(declaredRepository)) : undefined,
    ]);
    const similarNames = (search.objects ?? []).map((entry) => entry?.package).filter(Boolean);
    const scorecard = declaredRepository
      ? await optionalJson(scorecardUrl(declaredRepository))
      : undefined;
    const releaseYears = releaseActivityByYear(packument.time, packument.versions);
    const reasons = assessmentReasons({
      deprecated: release.deprecated,
      downloads,
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
    });
    const criticalVulnerabilityIds = criticalVulnerabilities(vulnerabilities);

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
      reasons,
      scorecard,
      sourceRepository,
      release,
      releaseYears,
      request,
      similarNames,
      vulnerabilities,
      version,
    });

    if (release.deprecated) {
      throw new Error(
        `hard block: exact release ${name}@${version} is deprecated: ${release.deprecated}`,
      );
    }
    if (criticalVulnerabilityIds.length > 0) {
      await requireCriticalException({
        criticalVulnerabilityIds,
        name,
        now: assessmentNow(),
        policy,
        projectRoot,
        version,
      });
    }
    const overridableReasons = reasons.filter(
      (reason) =>
        !reason.startsWith("exact release is deprecated:") &&
        reason !== "archive declares lifecycle scripts" &&
        reason !== "archive contains implicit native-build files" &&
        !criticalVulnerabilityIds.some((id) => reason === `known vulnerability: ${id}`),
    );
    if (overridableReasons.length > 0) {
      await requireWarningOverride({
        name,
        now: assessmentNow(),
        policy,
        projectRoot,
        reasons: overridableReasons,
        version,
      });
    }

    await exec("npm", ["cache", "add", archivePath, "--cache", cache, "--ignore-scripts"], {
      cwd: temporaryRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
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
        "--offline",
      ],
      { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    await assertInstalledArtifact(projectRoot, name, version, release.dist?.integrity);
    await writeAssessmentEvidence({
      archiveSha512: createHash("sha512").update(archive).digest("base64"),
      integrity: release.dist?.integrity,
      name,
      projectRoot,
      requiredOverrides: [
        ...(overridableReasons.length > 0
          ? [{ kind: "warnings", triggeredWarnings: overridableReasons }]
          : []),
        ...(criticalVulnerabilityIds.length > 0
          ? [{ kind: "critical-vulnerabilities", vulnerabilityIds: criticalVulnerabilityIds }]
          : []),
      ],
      section,
      tarballUrl,
      version,
    });
    console.log(`\nInstalled ${name}@${version} with lifecycle scripts disabled.`);
    if (lifecycleScripts.length > 0 || nativeBuildFiles.length > 0) {
      throw new Error(
        `package scripts remain disabled for ${name}@${version}; record an exact script justification and run npm run dependency:run-scripts -- ${name}@${version}`,
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
    throw new Error(`required registry request failed (${response.status} ${url})`);
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
    throw new Error(`package archive request failed (${response.status} ${url})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function verifyRegistryIntegrity(archive, dist) {
  const candidates = String(dist?.integrity ?? "")
    .split(/\s+/)
    .map((value) => value.match(/^(sha512|sha384|sha256|sha1)-(.+)$/))
    .filter(Boolean);
  if (candidates.length === 0 && typeof dist?.shasum === "string") {
    candidates.push([dist.shasum, "sha1", Buffer.from(dist.shasum, "hex").toString("base64")]);
  }
  if (candidates.length === 0) {
    throw new Error("registry release has no supported archive integrity evidence");
  }
  const verified = candidates.some(([, algorithm, expectedBase64]) => {
    const actual = createHash(algorithm).update(archive).digest();
    const expected = Buffer.from(expectedBase64, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!verified) {
    throw new Error("package archive integrity does not match registry evidence");
  }
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

function assessmentReasons({
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
  return [
    policy.warnOnDeprecation && deprecated
      ? `exact release is deprecated: ${deprecated}`
      : undefined,
    policy.warnOnLifecycleScripts && lifecycleScripts.length > 0
      ? "archive declares lifecycle scripts"
      : undefined,
    policy.warnOnNativeBuildFiles && nativeBuildFiles.length > 0
      ? "archive contains implicit native-build files"
      : undefined,
    policy.warnOnMissingRepository && !repository ? "no source repository is declared" : undefined,
    policy.warnOnMissingProvenance && !provenance
      ? "registry provenance is unavailable"
      : undefined,
    ageInDays(now, packageCreated) < policy.maximumPackageAgeDaysWithoutReview
      ? `package is younger than ${policy.maximumPackageAgeDaysWithoutReview} days`
      : undefined,
    ageInDays(now, releasePublished) > policy.maximumReleaseStalenessDays
      ? `exact release is older than ${policy.maximumReleaseStalenessDays} days`
      : undefined,
    downloads.downloads < policy.minimumLastMonthDownloads
      ? `last-month downloads are below ${policy.minimumLastMonthDownloads}`
      : undefined,
    policy.warnOnArchivedRepository && sourceRepository?.archived
      ? "declared source repository is archived"
      : undefined,
    policy.warnOnRepositoryMismatch &&
    sourceRepository &&
    ageInDays(now, sourceRepository.pushed_at) > policy.maximumRepositoryStalenessDays
      ? `declared source repository has no recent push within ${policy.maximumRepositoryStalenessDays} days`
      : undefined,
    sourceRepository &&
    sourceRepository.full_name.toLowerCase() !== githubRepository(repository)?.toLowerCase()
      ? "declared source repository does not match repository metadata"
      : undefined,
    policy.warnOnSimilarEstablishedNames &&
    similarNames.some(
      (candidate) =>
        candidate.name !== name &&
        candidate.name &&
        candidate.date &&
        ageInDays(now, candidate.date) >= policy.minimumSimilarPackageAgeDays,
    )
      ? "registry search returned similarly named established packages"
      : undefined,
    ...(policy.warnOnVulnerabilities
      ? (vulnerabilities.vulns ?? []).map(
          (vulnerability) => `known vulnerability: ${vulnerability.id ?? "unnamed OSV entry"}`,
        )
      : []),
  ].filter(Boolean);
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
  const privileges = scopeChanged ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 };
  const impactSubscore =
    1 - (1 - values.CIA[metrics.C]) * (1 - values.CIA[metrics.I]) * (1 - values.CIA[metrics.A]);
  const impact = scopeChanged
    ? 7.52 * (impactSubscore - 0.029) - 3.25 * (impactSubscore - 0.02) ** 15
    : 6.42 * impactSubscore;
  const exploitability =
    8.22 *
    values.AV[metrics.AV] *
    values.AC[metrics.AC] *
    privileges[metrics.PR] *
    values.UI[metrics.UI];
  if (![impact, exploitability].every(Number.isFinite) || impact <= 0) return Number.NaN;
  const score = scopeChanged
    ? Math.min(10, 1.08 * (impact + exploitability))
    : Math.min(10, impact + exploitability);
  return Math.ceil(score * 10) / 10;
}

async function requireWarningOverride({ name, now, policy, projectRoot, reasons, version }) {
  const path = decisionPath(projectRoot, name, version, "warnings");
  let record;
  try {
    record = await readCommittedDecision(projectRoot, path);
    validateExactDecision(record, {
      name,
      version,
      date: now,
      maximumAgeDays: policy.maximumDecisionAgeDays,
    });
    validateOfficialSourceUrl(record.officialSourceUrl);
    if (
      !Array.isArray(record.triggeredWarnings) ||
      JSON.stringify([...record.triggeredWarnings].sort()) !== JSON.stringify([...reasons].sort())
    ) {
      throw new Error(
        "warning override must list exactly the warnings triggered by this assessment",
      );
    }
  } catch (error) {
    throw new Error(
      `${warningGuidance(name, version, reasons)} ${error.message}. Expected ${path}`,
    );
  }
  console.log(`\nAccepted committed warning override for ${name}@${version}: ${record.reason}`);
}

async function requireCriticalException({
  criticalVulnerabilityIds,
  name,
  now,
  policy,
  projectRoot,
  version,
}) {
  const path = decisionPath(projectRoot, name, version, "critical-vulnerabilities");
  let record;
  try {
    record = await readCommittedDecision(projectRoot, path);
    validateExactDecision(record, {
      name,
      version,
      date: now,
      maximumAgeDays: policy.maximumDecisionAgeDays,
    });
    if (
      !Array.isArray(record.vulnerabilityIds) ||
      JSON.stringify([...record.vulnerabilityIds].sort()) !==
        JSON.stringify([...criticalVulnerabilityIds].sort())
    ) {
      throw new Error("critical exception must list exactly the critical vulnerability IDs");
    }
    const author = await lastCommitAuthor(projectRoot, path);
    if (
      !policy.criticalExceptionAuthorEmails.map((email) => email.toLowerCase()).includes(author)
    ) {
      throw new Error("critical exception must be committed by Nathan");
    }
  } catch (error) {
    throw new Error(
      `hard block: ${name}@${version} has critical vulnerabilities ${criticalVulnerabilityIds.join(", ")}; ${error.message}. Expected Nathan-authored exception ${path}`,
    );
  }
  console.log(
    `\nAccepted Nathan-authored critical exception for ${name}@${version}: ${record.reason}`,
  );
}

function printReport(evidence) {
  const repository = evidence.release.repository ?? evidence.packument.repository;
  const author = evidence.release.author ?? evidence.packument.author;
  const maintainers = evidence.packument.maintainers ?? evidence.release.maintainers;
  const publisher = evidence.release._npmUser;
  console.log(`Dependency artifact assessment: ${evidence.name}@${evidence.version}`);
  console.log("\nRegistry-observed facts");
  console.log(`  Request: ${evidence.request}`);
  console.log(`  Exact selected release: ${evidence.name}@${evidence.version}`);
  console.log(`  Package created: ${show(evidence.packument.time?.created)}`);
  console.log(`  Exact release published: ${show(evidence.packument.time?.[evidence.version])}`);
  console.log(`  Last registry update: ${show(evidence.packument.time?.modified)}`);
  console.log(
    `  Release activity by year: ${evidence.releaseYears.map(([year, count]) => `${year}: ${count}`).join(", ") || "unavailable"}`,
  );
  console.log(`  Deprecation: ${show(evidence.release.deprecated, "none declared")}`);
  console.log(`  Archive integrity: verified (${show(evidence.release.dist?.integrity)})`);
  console.log(`  Archive bytes inspected: ${evidence.archive.byteLength}`);
  console.log("\nSelf-declared npm identity (unverified; maintainer history is unavailable)");
  console.log(`  Declared author: ${identity(author)}`);
  console.log(`  Current maintainers: ${identityList(maintainers)}`);
  console.log(`  Exact-version publisher: ${identity(publisher)}`);
  console.log(`  Repository declaration: ${repositoryValue(repository)}`);
  console.log("\nArchive-observed static evidence (verified bytes; nothing executed)");
  console.log(`  Lifecycle scripts: ${evidence.lifecycleScripts.join("; ") || "none"}`);
  console.log(`  Implicit native-build files: ${evidence.nativeBuildFiles.join(", ") || "none"}`);
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
  console.log(`  Declared repository owner: ${show(evidence.sourceRepository?.owner?.login)}`);
  console.log(`  Declared repository activity: ${show(evidence.sourceRepository?.pushed_at)}`);
  console.log(
    `  Declared repository archived: ${show(evidence.sourceRepository?.archived, "unavailable")}`,
  );
  console.log(
    `  OpenSSF Scorecard: ${evidence.scorecard ? "available (unverified external evidence)" : "unavailable or unverified"}`,
  );
  console.log(
    `  OSV vulnerabilities: ${(evidence.vulnerabilities.vulns ?? []).map((vulnerability) => vulnerability.id).join(", ") || "none reported"}`,
  );
  console.log("\nTriggered assessment reasons (not a trust score)");
  for (const reason of evidence.reasons) console.log(`  - ${reason}`);
  if (evidence.reasons.length === 0) console.log("  none");
}

async function assertInstalledArtifact(projectRoot, name, version, integrity) {
  const lock = JSON.parse(await readFile(join(projectRoot, "package-lock.json"), "utf8"));
  const installed = lock.packages?.[`node_modules/${name}`];
  if (installed?.version !== version || (integrity && installed.integrity !== integrity)) {
    throw new Error(`installed lockfile artifact does not match assessed ${name}@${version}`);
  }
}

async function writeAssessmentEvidence({
  archiveSha512,
  integrity,
  name,
  projectRoot,
  requiredOverrides,
  section,
  tarballUrl,
  version,
}) {
  const path = decisionPath(projectRoot, name, version, "assessment");
  await mkdir(join(projectRoot, "config", "dependency-decisions"), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ archiveSha512, assessmentDate: assessmentNow(), assessmentVersion: 1, integrity, package: name, requiredOverrides, section, tarballUrl, version }, null, 2)}\n`,
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
  if (flags.length > 1 || requests.length !== 1 || (flags[0] && !sections[flags[0]])) {
    return {};
  }
  return { request: requests[0], section: flags[0] ? sections[flags[0]] : "dependencies" };
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
    process.env.LIRNA_NPM_DOWNLOADS_URL ?? "https://api.npmjs.org/downloads/point/last-month/",
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
    process.env.LIRNA_SCORECARD_API_URL ?? "https://api.securityscorecards.dev/projects/",
  );
  return new URL(`github.com/${repository}`, base);
}

function githubRepository(repository) {
  const value = repositoryValue(repository)
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
  const match = value.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/#]+)\/?(?:#.*)?$/i);
  return match?.[1];
}

function assessmentNow() {
  return process.env.LIRNA_ASSESSMENT_NOW ?? new Date().toISOString();
}

function ageInDays(now, date) {
  const difference = new Date(now).getTime() - new Date(date).getTime();
  return Number.isFinite(difference) ? difference / 86_400_000 : Number.NaN;
}

function warningGuidance(name, version, reasons) {
  return [
    `assessment warnings stopped installation of ${name}@${version}: ${reasons.join("; ")}.`,
    "Search npm and verify the exact package name against official documentation or the canonical source repository.",
    "Remove an incorrect package, or commit the exact package warning override described below.",
  ].join(" ");
}

function policyPath() {
  return fileURLToPath(new URL("../config/dependency-assessment-policy.json", import.meta.url));
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`missing ${label}`);
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
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function identity(value) {
  if (!value) return "unavailable";
  if (typeof value === "string") return value;
  return [value.name, value.email].filter(Boolean).join(" <") + (value.email ? ">" : "");
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
  console.error(`Dependency assessment failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
