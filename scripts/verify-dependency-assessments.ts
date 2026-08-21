#!/usr/bin/env node
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

async function main() {
  const revisions = prepareDependencyRevisions();
  if (!revisions) return;
  const additions = await changedDirectDependencies(revisions);
  console.log(
    `dependency lockfile verification passed (${additions.length} changed direct dependencies)`,
  );
}

export async function changedDirectDependencies(revisions) {
  const [beforeManifest, afterManifest, beforeLock, afterLock] =
    await Promise.all([
      readJson(revisions.base, "package.json"),
      readJson(revisions.target, "package.json"),
      readJson(revisions.base, "bun.lock"),
      readJson(revisions.target, "bun.lock"),
    ]);
  return directAdditions(beforeManifest, afterManifest, beforeLock, afterLock);
}

export function directAdditions(
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

export function range(args) {
  if (args.length !== 2)
    throw new Error(
      "usage: bun run dependency:check -- --staged | --range BASE HEAD",
    );
  return { base: args[0], target: args[1] };
}

export function prepareDependencyRevisions(args = process.argv.slice(2)) {
  const root = process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();
  process.chdir(root);
  const [mode, ...rest] = args;
  const revisions =
    mode === "--staged" ? { base: "HEAD", target: ":" } : range(rest);
  return /^0+$/.test(revisions.base) ? undefined : revisions;
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Dependency lockfile verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
