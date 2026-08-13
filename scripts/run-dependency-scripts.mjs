#!/usr/bin/env node

import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  decisionPath,
  readCommittedDecision,
  validateExactDecision,
} from "./dependency-decisions.mjs";

const exec = promisify(execFile);

async function main() {
  const requests = process.argv.slice(2);
  if (requests.length !== 1 || requests[0]?.startsWith("-") || !requests[0]?.includes("@")) {
    throw new Error("usage: npm run dependency:run-scripts -- <exact-package@version>");
  }
  const projectRoot = resolve(process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd());
  const { name, version } = exactIdentity(requests[0]);
  const lock = JSON.parse(await readFile(join(projectRoot, "package-lock.json"), "utf8"));
  if (lock.packages?.[`node_modules/${name}`]?.version !== version) {
    throw new Error(`lockfile does not contain exact package ${name}@${version}`);
  }

  const policy = JSON.parse(
    await readFile(new URL("../config/dependency-assessment-policy.json", import.meta.url), "utf8"),
  );
  const path = decisionPath(projectRoot, name, version, "scripts");
  const record = await readCommittedDecision(projectRoot, path);
  validateExactDecision(record, {
    name,
    version,
    date: process.env.LIRNA_ASSESSMENT_NOW ?? new Date().toISOString(),
    maximumAgeDays: policy.maximumDecisionAgeDays,
  });

  const nix = process.env.LIRNA_NIX_COMMAND ?? "nix";
  const flake = process.env.LIRNA_NIX_FLAKE ?? resolve(new URL("..", import.meta.url).pathname);
  const disposableRoot = await mkdtemp(join(tmpdir(), "lirna-dependency-scripts-"));
  try {
    await cp(join(projectRoot, "package.json"), join(disposableRoot, "package.json"));
    await cp(join(projectRoot, "package-lock.json"), join(disposableRoot, "package-lock.json"));
    await exec(
      nix,
      ["develop", flake, "--command", "npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: disposableRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    await exec(
      nix,
      ["develop", flake, "--command", "npm", "rebuild", name, "--no-audit", "--no-fund"],
      { cwd: disposableRoot, maxBuffer: 10 * 1024 * 1024 },
    );
  } finally {
    await rm(disposableRoot, { recursive: true, force: true });
  }
  console.log(`Ran required scripts for ${name}@${version} in the disposable Nix environment.`);
}

function exactIdentity(request) {
  const separator = request.startsWith("@") ? request.indexOf("@", 1) : request.lastIndexOf("@");
  if (separator <= 0 || separator === request.length - 1)
    throw new Error("an exact package version is required");
  const name = request.slice(0, separator);
  const version = request.slice(separator + 1);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("an exact package version is required");
  }
  return { name, version };
}

main().catch((error) => {
  console.error(
    `Dependency script execution failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
