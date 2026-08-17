#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
flake="$root/flake.nix"
workflow="$root/.github/workflows/nix.yml"
report="$root/docs/code-quality-standard.md"

test -f "$flake"
test -f "$workflow"

grep -Fq 'checks.${system} = {' "$flake"
grep -Fq 'server = lirna;' "$flake"
grep -Fq 'desktop = lirnaDesktop;' "$flake"
grep -Fq 'module = (nixpkgs.lib.nixosSystem' "$flake"
grep -Fq 'nixosTest = import ./nix/test.nix' "$flake"
node - "$workflow" <<'NODE'
const fs = require("node:fs");

const workflow = fs.readFileSync(process.argv[2], "utf8");
const stepName = "      - name: Build Nix packages and verify VM behavior";
const stepStart = workflow.indexOf(stepName);
const nextStep = workflow.indexOf("\n      - name:", stepStart + stepName.length);
const step = workflow.slice(stepStart, nextStep === -1 ? undefined : nextStep);

if (
  stepStart === -1 ||
  !step.includes("run: nix flake check --print-build-logs") ||
  step.includes("\n        if:")
) {
  throw new Error("Pull requests must run the full Nix build step unconditionally");
}
NODE
if grep -Fq 'nix flake check --no-build' "$workflow"; then
  printf '%s\n' "Pull requests must realize every Nix check build" >&2
  exit 1
fi
grep -Fq 'upstream-cache: https://cache.nixos.org' "$workflow"
grep -Fq 'cancel-in-progress: true' "$workflow"
grep -Fq '".github/workflows/nix.yml"' "$workflow"
grep -Eq 'nix-installer-action@[0-9a-f]{40}' "$workflow"
grep -Eq 'magic-nix-cache-action@[0-9a-f]{40}' "$workflow"
grep -Fq 'nix/**' "$workflow"
grep -Fq 'Nix flake checks' "$report"
grep -Fq 'server package, desktop package, NixOS module closure, and NixOS VM integration test' "$report"
grep -Fq 'Pull requests and pushes to `main` perform the full package and VM verification' "$report"

printf '%s\n' "Nix verification policy tests passed"
