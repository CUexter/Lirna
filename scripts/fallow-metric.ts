#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

function runFallow(args) {
  try {
    const stdout = execFileSync(
      "fallow",
      [...args, "--format", "json", "--quiet"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        cwd: root,
      },
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

const health = runFallow(["health", "--score", "--save-snapshot"]);
const deadCode = runFallow(["dead-code", "--summary"]);
const dupes = runFallow(["dupes", "--summary"]);

const envelope = {
  git_sha: sha,
  timestamp: new Date().toISOString(),
  fallow_version:
    health?.version ?? deadCode?.version ?? dupes?.version ?? null,
  health_score: health?.health_score?.score ?? null,
  health_grade: health?.health_score?.grade ?? null,
  health_penalties: health?.health_score?.penalties ?? null,
  health_summary: health?.summary ?? null,
  dead_code: {
    total: deadCode?.total_issues ?? null,
    by_kind: deadCode?.summary ?? null,
  },
  dupes: {
    clone_groups: dupes?.stats?.clone_groups ?? null,
    duplicated_tokens: dupes?.stats?.duplicated_tokens ?? null,
    duplication_percentage: dupes?.stats?.duplication_percentage ?? null,
    total_tokens: dupes?.stats?.total_tokens ?? null,
  },
};

const metricsDir = join(root, ".fallow", "metrics");
mkdirSync(metricsDir, { recursive: true });
const outPath = join(metricsDir, `${sha}.json`);
writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`);

const score = envelope.health_score ?? "?";
const grade = envelope.health_grade ?? "?";
const dcTotal = envelope.dead_code.total ?? "?";
const dupeGroups = envelope.dupes.clone_groups ?? "?";
const dupePct = envelope.dupes.duplication_percentage ?? "?";
console.log(
  `fallow metric: score ${score} (${grade}) | dead-code ${dcTotal} | dupes ${dupeGroups} groups (${dupePct}%) -> ${outPath}`,
);
