import { readFileSync } from "node:fs";

const changedPaths = readFileSync(0, "utf8")
  .split("\n")
  .map((path) => path.trim())
  .filter(Boolean);
const forceFull = process.argv.includes("--full");

const changes = (path) => changedPaths.some((candidate) => candidate === path);
const changesWithin = (path) =>
  changedPaths.some((candidate) => candidate.startsWith(`${path}/`));

const dependencyOrNixChange =
  forceFull ||
  changes("flake.nix") ||
  changes("flake.lock") ||
  changes("package.json") ||
  changes("bun.lock") ||
  changes(".github/workflows/nix.yml") ||
  changes("scripts/classify-nix-changes.mjs") ||
  changes("scripts/test-nix-verification.sh") ||
  changesWithin("nix") ||
  changedPaths.some((path) => path.endsWith("/package.json"));

const desktopChange =
  dependencyOrNixChange || changesWithin("apps/web/src-tauri");
const vmChange = dependencyOrNixChange;

console.log(`desktop=${desktopChange}`);
console.log(`vm=${vmChange}`);
