#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const root = process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();

async function main() {
  process.chdir(root);
  const [mode, ...args] = process.argv.slice(2);
  const revisions =
    mode === "--staged" ? { base: "HEAD", target: ":" } : range(args);
  if (/^0+$/.test(revisions.base)) return;
  const [beforeManifest, afterManifest, beforeLock, afterLock] =
    await Promise.all([
      readJson(revisions.base, "package.json"),
      readJson(revisions.target, "package.json"),
      readJson(revisions.base, "bun.lock"),
      readJson(revisions.target, "bun.lock"),
    ]);
  const additions = directAdditions(
    beforeManifest,
    afterManifest,
    beforeLock,
    afterLock,
  );
  for (const dependency of additions) {
    const identity = encodeURIComponent(
      `${dependency.name}@${dependency.version}`,
    ).replaceAll("%40", "@");
    const record = await readJson(
      revisions.target,
      `config/dependency-decisions/${identity}.json`,
    );
    if (!record)
      throw new Error(
        `unassessed direct dependency ${dependency.name}@${dependency.version}; add a committed dependency decision`,
      );
    validateDecision(record, dependency);
  }
  console.log(
    `dependency assessment verification passed (${additions.length} changed direct dependencies)`,
  );
}

function directAdditions(
  beforeManifest = {},
  afterManifest = {},
  beforeLock = {},
  afterLock = {},
) {
  const before = directDependencies(beforeManifest, beforeLock);
  const after = directDependencies(afterManifest, afterLock);
  return [...after].flatMap(([name, dependency]) => {
    if (!dependency.version || !dependency.integrity)
      throw new Error(
        `direct dependency ${name} is missing an exact Bun lockfile entry`,
      );
    return !before.has(name) ||
      JSON.stringify(before.get(name)) !== JSON.stringify(dependency)
      ? [{ name, ...dependency }]
      : [];
  });
}

function directDependencies(manifest, lock) {
  const workspace = lock?.workspaces?.[""] ?? {};
  const result = new Map();
  for (const section of sections) {
    for (const [name, spec] of Object.entries(manifest?.[section] ?? {})) {
      const entry = lockPackage(lock, name);
      result.set(name, {
        section,
        spec,
        version: entry.version,
        integrity: entry.integrity,
      });
    }
    for (const [name, spec] of Object.entries(workspace[section] ?? {})) {
      if (!result.has(name)) {
        const entry = lockPackage(lock, name);
        result.set(name, {
          section,
          spec,
          version: entry.version,
          integrity: entry.integrity,
        });
      }
    }
  }
  return result;
}

function lockPackage(lock, name) {
  const entry = lock?.packages?.[name];
  if (!Array.isArray(entry) || typeof entry[0] !== "string") return {};
  const prefix = `${name}@`;
  return {
    version: entry[0].startsWith(prefix)
      ? entry[0].slice(prefix.length)
      : undefined,
    integrity: typeof entry.at(-1) === "string" ? entry.at(-1) : undefined,
  };
}

function validateDecision(record, dependency) {
  if (
    record.package !== dependency.name ||
    record.version !== dependency.version ||
    record.section !== dependency.section
  )
    throw new Error(
      `dependency decision does not match ${dependency.name}@${dependency.version}`,
    );
  if (record.integrity !== dependency.integrity)
    throw new Error(
      `dependency decision does not match Bun lockfile integrity for ${dependency.name}`,
    );
  if (typeof record.reason !== "string" || record.reason.trim().length < 10)
    throw new Error("dependency decision requires a package-specific reason");
  for (const field of ["maintenance", "provenance", "alternatives"]) {
    if (typeof record[field] !== "string" || record[field].trim().length < 10)
      throw new Error(`dependency decision requires ${field} review evidence`);
  }
  if (!Number.isFinite(new Date(record.assessmentDate).getTime()))
    throw new Error("dependency decision has an invalid assessmentDate");
}

function range(args) {
  if (args.length !== 2)
    throw new Error(
      "usage: bun run dependency:check -- --staged | --range BASE HEAD",
    );
  return { base: args[0], target: args[1] };
}

async function readJson(revision, path) {
  try {
    const { stdout } = await exec("git", [
      "show",
      revision === ":" ? `:${path}` : `${revision}:${path}`,
    ]);
    return JSON.parse(stdout.replace(/,\s*([}\]])/g, "$1"));
  } catch (error) {
    if (
      error.code === 128 &&
      String(error.stderr).includes(`path '${path}' does not exist`)
    )
      return undefined;
    throw error;
  }
}

main().catch((error) => {
  console.error(`Dependency assessment verification failed: ${error.message}`);
  process.exitCode = 1;
});
