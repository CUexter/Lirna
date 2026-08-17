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
grep -Fq 'run: nix flake check --no-build' "$workflow"
grep -Fq "github.event_name == 'workflow_dispatch'" "$workflow"
grep -Fq "github.event_name == 'push' && github.ref == 'refs/heads/main'" "$workflow"
grep -Fq 'run: nix flake check --print-build-logs' "$workflow"
grep -Fq 'upstream-cache: https://cache.nixos.org' "$workflow"
grep -Fq 'cancel-in-progress: true' "$workflow"
grep -Fq '".github/workflows/nix.yml"' "$workflow"
grep -Eq 'nix-installer-action@[0-9a-f]{40}' "$workflow"
grep -Eq 'magic-nix-cache-action@[0-9a-f]{40}' "$workflow"
grep -Fq 'nix/**' "$workflow"
grep -Fq 'Nix flake checks' "$report"
grep -Fq 'server package, desktop package, NixOS module closure, and NixOS VM integration test' "$report"
grep -Fq 'Pull requests evaluate every check without realizing those builds' "$report"

printf '%s\n' "Nix verification policy tests passed"
