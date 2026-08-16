#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { validateAssessmentClassification } from "./dependency-assessment-policy.mjs";
import { decisionIdentity } from "./dependency-decisions.mjs";

const exec = promisify(execFile);
const projectRoot = process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();
const policy = JSON.parse(
  await readFile(
    new URL("../config/dependency-assessment-policy.json", import.meta.url),
  ),
);
const directSections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

process.chdir(projectRoot);

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const revisions =
    mode === "--staged" ? { base: "HEAD", target: ":" } : range(args);
  if (/^0+$/.test(revisions.base)) {
    console.log(
      "dependency assessment verification skipped: the comparison base is empty",
    );
    return;
  }
  const [baseManifest, targetManifest, baseLock, targetLock] =
    await Promise.all([
      readJson(revisions.base, "package.json"),
      readJson(revisions.target, "package.json"),
      readJson(revisions.base, "package-lock.json"),
      readJson(revisions.target, "package-lock.json"),
    ]);
  const additions = directAdditions(
    baseManifest,
    targetManifest,
    baseLock,
    targetLock,
  );

  for (const dependency of additions) {
    const assessment = await readJson(
      revisions.target,
      `config/dependency-decisions/${decisionIdentity(dependency.name, dependency.version)}.assessment.json`,
    );
    if (!assessment) {
      throw new Error(
        `unassessed direct dependency ${dependency.name}@${dependency.version}; use npm run dependency:add -- ${dependency.name}@${dependency.version}`,
      );
    }
    validateAssessment(assessment, dependency);
    if (process.env.LIRNA_VERIFY_DEPENDENCY_ARCHIVES === "1") {
      await validateArchiveEvidence(assessment, dependency);
    }
  }
  console.log(
    `dependency assessment verification passed (${additions.length} new direct dependencies)`,
  );
}

async function validateArchiveEvidence(record, dependency) {
  let url;
  try {
    url = new URL(record.tarballUrl);
    if (
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      `assessment evidence for ${dependency.name}@${dependency.version} lacks a valid tarball URL`,
    );
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `could not retrieve assessed archive for ${dependency.name}@${dependency.version}`,
    );
  }
  const archive = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha512").update(archive).digest("base64");
  if (digest !== record.archiveSha512) {
    throw new Error(
      `assessed archive digest changed for ${dependency.name}@${dependency.version}`,
    );
  }
  if (!archiveMatchesIntegrity(archive, record.integrity)) {
    throw new Error(
      `assessed archive does not match lockfile integrity for ${dependency.name}@${dependency.version}`,
    );
  }
}

function archiveMatchesIntegrity(archive, integrity) {
  return String(integrity)
    .split(/\s+/)
    .map((value) => value.match(/^(sha512|sha384|sha256|sha1)-(.+)$/))
    .filter(Boolean)
    .some(([, algorithm, expectedBase64]) => {
      const actual = createHash(algorithm).update(archive).digest("base64");
      return actual === expectedBase64;
    });
}

function range(args) {
  if (args.length !== 2)
    throw new Error(
      "usage: verify-dependency-assessments.mjs --staged | --range BASE HEAD",
    );
  return { base: args[0], target: args[1] };
}

function directAdditions(
  baseManifest = {},
  targetManifest = {},
  baseLock = {},
  targetLock = {},
) {
  const base = directDependencies(baseManifest, baseLock);
  const target = directDependencies(targetManifest, targetLock);
  return [...target].flatMap(([name, dependency]) => {
    const installed = targetLock.packages?.[`node_modules/${name}`];
    if (!installed?.version) {
      throw new Error(
        `direct dependency ${name} is missing an exact lockfile package entry`,
      );
    }
    const previous = base.get(name);
    const changed =
      !previous ||
      previous.section !== dependency.section ||
      previous.spec !== dependency.spec ||
      previous.version !== installed.version ||
      previous.integrity !== installed.integrity;
    return changed
      ? [
          {
            integrity: installed.integrity,
            name,
            section: dependency.section,
            version: installed.version,
          },
        ]
      : [];
  });
}

function directDependencies(manifest, lock) {
  const root = lock.packages?.[""] ?? {};
  const result = new Map();
  for (const section of directSections) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      const version = lock.packages?.[`node_modules/${name}`]?.version;
      const integrity = lock.packages?.[`node_modules/${name}`]?.integrity;
      result.set(name, { integrity, section, spec, version });
    }
    for (const [name, spec] of Object.entries(root[section] ?? {})) {
      if (!result.has(name))
        result.set(name, {
          integrity: lock.packages?.[`node_modules/${name}`]?.integrity,
          section,
          spec,
          version: lock.packages?.[`node_modules/${name}`]?.version,
        });
    }
  }
  return result;
}

function validateAssessment(record, dependency) {
  if (
    record.package !== dependency.name ||
    record.version !== dependency.version
  ) {
    throw new Error(
      `assessment evidence does not match exact package ${dependency.name}@${dependency.version}`,
    );
  }
  if (
    typeof record.archiveSha512 !== "string" ||
    typeof record.tarballUrl !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/u.test(record.archiveSha512)
  ) {
    throw new Error(
      `assessment evidence for ${dependency.name}@${dependency.version} lacks verified archive evidence`,
    );
  }
  if (record.integrity !== dependency.integrity) {
    throw new Error(
      `assessment evidence does not match lockfile integrity for ${dependency.name}@${dependency.version}`,
    );
  }
  if (record.section !== dependency.section) {
    throw new Error(
      `assessment evidence does not match dependency section for ${dependency.name}@${dependency.version}`,
    );
  }
  if (!Number.isFinite(new Date(record.assessmentDate).getTime())) {
    throw new Error(
      `assessment evidence for ${dependency.name}@${dependency.version} is malformed`,
    );
  }
  validateAssessmentClassification(record, policy);
}

async function readJson(revision, path) {
  try {
    const target = revision === ":" ? `:${path}` : `${revision}:${path}`;
    const { stdout } = await exec("git", ["show", target]);
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 128) return undefined;
    throw error;
  }
}

main().catch((error) => {
  console.error(
    `Dependency assessment verification failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
