import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { isEligibleSource } from "./check-coverage.ts";

const root = path.resolve(import.meta.dirname, "..");
const baselineFile = path.join(root, "config/coverage-baseline.json");
const uiPackageDir = path.join(root, "packages/ui");
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

function hashFile(source) {
  return createHash("sha256")
    .update(readFileSync(path.join(root, source)))
    .digest("hex");
}

function gitPaths() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`git status failed:\n${result.stderr}`);
  const paths = new Set();
  for (const line of result.stdout.split("\n")) {
    if (!line) continue;
    const renamed = line.match(/^.{2} .* -> (.+)$/);
    const entry = renamed ? renamed[1] : line.slice(3);
    paths.add(entry.trim().replace(/^"|"$/g, ""));
  }
  return paths;
}

function newEligibleSources(before, after) {
  const sources = new Set();
  for (const entry of after) {
    if (before.has(entry)) continue;
    const source = entry.replaceAll(path.sep, "/");
    if (!source.startsWith("packages/ui/src/")) continue;
    if (!sourceExtensions.has(path.extname(source))) continue;
    if (!isEligibleSource(source)) continue;
    sources.add(source);
  }
  return [...sources].sort();
}

function appendToBaseline(sources) {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  if (!baseline.absentSources) baseline.absentSources = {};
  const absentSources = baseline.absentSources;
  const added = [];
  for (const source of sources) {
    if (source in absentSources) continue;
    absentSources[source] = hashFile(source);
    added.push(source);
  }
  if (added.length > 0)
    writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  return added;
}

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (result.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
}

function shadcnAdd(shadcnArgs) {
  if (shadcnArgs.length === 0) {
    throw new Error(
      "No components given. Usage: bun run ui:add <component...> | bun run ui:add -- --baseline-only <file...>",
    );
  }
  const before = gitPaths();
  run("bunx", ["shadcn@latest", "add", ...shadcnArgs], { cwd: uiPackageDir });
  const after = gitPaths();
  const sources = newEligibleSources(before, after);
  if (sources.length > 0) {
    run(
      "bunx",
      ["biome", "format", "--write", ...sources.map((s) => path.join(root, s))],
      { cwd: root },
    );
  }
  return sources;
}

function baselineOnly(files) {
  if (files.length === 0)
    throw new Error(
      "No files given. Usage: bun run ui:add -- --baseline-only <file...>",
    );
  const sources: string[] = [];
  for (const file of files) {
    const source = path
      .relative(root, path.resolve(process.cwd(), file))
      .replaceAll(path.sep, "/");
    if (!existsSync(path.join(root, source)))
      throw new Error(`File not found: ${source}`);
    if (!isEligibleSource(source))
      throw new Error(`Not eligible for the coverage baseline: ${source}`);
    sources.push(source);
  }
  return [...new Set(sources)].sort();
}

function main() {
  const args = process.argv.slice(2);
  const baselineIndex = args.indexOf("--baseline-only");

  let sources: string[];
  if (baselineIndex !== -1) {
    sources = baselineOnly(args.slice(baselineIndex + 1));
  } else {
    sources = shadcnAdd(args);
  }

  const added = appendToBaseline(sources);
  if (added.length > 0) {
    console.log(`Baselined ${added.length} new source(s):`);
    for (const source of added) console.log(`  ${source}`);
  } else {
    console.log("No new sources to baseline.");
  }
}

if (import.meta.main) main();
