import { readFileSync } from "node:fs";

const outputPaths = JSON.parse(
  readFileSync(
    new URL("../config/nix-output-paths.json", import.meta.url),
    "utf8",
  ),
);

const changedPaths = readFileSync(0, "utf8")
  .split("\n")
  .map((path) => path.trim())
  .filter(Boolean);
const forceFull = process.argv.includes("--full");

const changes = (path) => changedPaths.some((candidate) => candidate === path);
const changesWithin = (path) =>
  changedPaths.some((candidate) => candidate.startsWith(`${path}/`));
const affects = (paths) =>
  paths.some((path) => changes(path) || changesWithin(path));

const nixPolicyChange =
  forceFull ||
  changes("flake.nix") ||
  changes("flake.lock") ||
  changes("config/nix-output-paths.json") ||
  changes(".github/workflows/nix.yml") ||
  changes("scripts/classify-nix-changes.ts") ||
  changes("scripts/test-nix-verification.sh") ||
  changesWithin("nix");

const desktopChange = nixPolicyChange || affects(outputPaths.desktop);
const vmChange = nixPolicyChange || affects(outputPaths.server);

console.log(`desktop=${desktopChange}`);
console.log(`vm=${vmChange}`);
