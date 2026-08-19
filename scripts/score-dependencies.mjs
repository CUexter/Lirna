#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectEvidence } from "./dependency-evidence.mjs";
import { assessmentFindings } from "./dependency-score-findings.mjs";
import {
  classifyAssessment,
  validateScorePolicy,
} from "./dependency-score-policy.mjs";
import {
  changedDirectDependencies,
  range,
} from "./verify-dependency-assessments.mjs";

const root = process.env.LIRNA_DEPENDENCY_PROJECT_ROOT ?? process.cwd();

async function main() {
  process.chdir(root);
  const [mode, ...args] = process.argv.slice(2);
  const revisions =
    mode === "--staged" ? { base: "HEAD", target: ":" } : range(args);
  if (/^0+$/.test(revisions.base)) return;
  const additions = await changedDirectDependencies(revisions);
  if (additions.length === 0) {
    console.log(
      "dependency confidence scoring skipped (no changed direct dependencies)",
    );
    return;
  }
  const policy = JSON.parse(await readFile(policyPath(), "utf8"));
  validateScorePolicy(policy);
  for (const dependency of additions) {
    await reportDependencyScore(dependency, policy);
  }
}

async function reportDependencyScore(dependency, policy) {
  const { name, version } = dependency;
  try {
    const evidence = await collectEvidence(name, version);
    const classification = classifyAssessment(
      assessmentFindings({ ...evidence, name, now: assessmentNow(), policy }),
      policy,
    );
    printScore({
      name,
      version,
      classification,
      policy,
      scorecard: evidence.scorecard,
    });
  } catch (error) {
    console.warn(
      `dependency confidence scoring for ${name}@${version} failed open: ${error.message}`,
    );
  }
}

function printScore({ name, version, classification, policy, scorecard }) {
  console.log(
    `dependency confidence: ${name}@${version} score ${classification.confidenceScore}/100 (${classification.confidenceTier})`,
  );
  console.log(
    `  OpenSSF Scorecard: ${scorecard ? "available" : "unavailable"}`,
  );
  for (const finding of classification.findings) {
    console.log(`  - ${finding.message} (-${finding.deduction})`);
  }
  if (classification.findings.length === 0) console.log("  Findings: none");
  if (classification.confidenceScore >= policy.minimumScore) return;
  const summary = `dependency confidence for ${name}@${version} is ${classification.confidenceScore}/100 (${classification.confidenceTier}), below the configured minimum ${policy.minimumScore}`;
  console.warn(
    `WARNING: ${summary}. This advisory score does not block the change; review the findings above.`,
  );
  if (process.env.GITHUB_ACTIONS) console.log(`::warning ::${summary}`);
}

function assessmentNow() {
  return process.env.LIRNA_ASSESSMENT_NOW ?? new Date().toISOString();
}

function policyPath() {
  return fileURLToPath(
    new URL("../config/dependency-score-policy.json", import.meta.url),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `Dependency confidence scoring failed open: ${error.message}`,
    );
  });
}
