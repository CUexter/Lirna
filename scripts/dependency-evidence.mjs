import { execFile } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  criticalVulnerabilities,
  githubRepository,
} from "./dependency-score-policy.mjs";

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
const registry = normalizeBaseUrl(
  process.env.LIRNA_NPM_REGISTRY ?? "https://registry.npmjs.org/",
);
const githubToken = process.env.LIRNA_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;

export async function collectEvidence(name, version) {
  const packument = await fetchJson(
    new URL(encodeURIComponent(name), registry),
  );
  const release = packument.versions?.[version];
  if (!release || typeof release !== "object") {
    throw new Error(`registry metadata does not contain ${name}@${version}`);
  }
  const tarballUrl = requiredString(
    release.dist?.tarball,
    "release tarball URL",
  );
  const archive = await fetchBytes(new URL(tarballUrl));
  verifyRegistryIntegrity(archive, release.dist);
  const { lifecycleScripts, nativeBuildFiles } = await inspectArchive(
    archive,
    name,
    version,
  );
  const repository = release.repository ?? packument.repository;
  const declaredRepository = githubRepository(repository);
  const [
    search,
    provenance,
    downloads,
    vulnerabilities,
    sourceRepository,
    scorecard,
  ] = await Promise.all([
    fetchJson(
      new URL(`-/v1/search?text=${encodeURIComponent(name)}&size=10`, registry),
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
      ? fetchJson(githubUrl(declaredRepository), githubHeaders())
      : undefined,
    declaredRepository
      ? optionalJson(scorecardUrl(declaredRepository))
      : undefined,
  ]);
  return {
    criticalVulnerabilityIds: criticalVulnerabilities(vulnerabilities),
    deprecated: release.deprecated,
    downloads,
    lifecycleScripts,
    nativeBuildFiles,
    packageCreated: packument.time?.created,
    provenance,
    releasePublished: packument.time?.[version],
    repository,
    similarNames: (search.objects ?? [])
      .map((entry) => entry?.package)
      .filter(Boolean),
    sourceRepository,
    scorecard,
    vulnerabilities,
  };
}

async function inspectArchive(archive, name, version) {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "lirna-dependency-score-"),
  );
  try {
    const archivePath = join(temporaryRoot, "package.tgz");
    await writeFile(archivePath, archive);
    // These tar operations only list entries and stream one file to stdout. No
    // package content is extracted, imported, or executed during scoring.
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
    return {
      lifecycleScripts: Object.entries(manifest.scripts ?? {})
        .filter(([script]) => lifecycleNames.has(script))
        .map(([script, command]) => `${script}: ${String(command)}`),
      nativeBuildFiles: entries.filter((entry) =>
        /(^|\/)(binding\.gyp|\.node-gyp|CMakeLists\.txt|[^/]+\.node)$/.test(
          entry,
        ),
      ),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
  });
  if (!response.ok) {
    throw new Error(
      `required registry request failed (${response.status} ${url})`,
    );
  }
  return response.json();
}

async function optionalJson(url, headers) {
  try {
    return await fetchJson(url, headers);
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

function githubHeaders() {
  return githubToken ? { authorization: `Bearer ${githubToken}` } : {};
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

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`missing ${label}`);
  return value;
}

function show(value, fallback = "unavailable") {
  return value === undefined || value === null || value === ""
    ? fallback
    : String(value);
}
