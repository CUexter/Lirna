#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
flake="$root/flake.nix"
workflow="$root/.github/workflows/nix.yml"
classifier="$root/scripts/classify-nix-changes.mjs"
report="$root/docs/code-quality-standard.md"

test -f "$flake"
test -f "$workflow"
test -f "$classifier"

grep -Fq 'checks.${system} = {' "$flake"
grep -Fq 'server = lirna;' "$flake"
grep -Fq 'desktop = lirnaDesktop;' "$flake"
grep -Fq 'module = (nixpkgs.lib.nixosSystem' "$flake"
grep -Fq 'nixosTest = import ./nix/test.nix' "$flake"
classify() {
  printf '%s\n' "$1" | node "$classifier"
}

test "$(classify 'apps/web/src/routes/index.tsx')" = $'desktop=false\nvm=false'
test "$(classify 'apps/server/src/index.ts')" = $'desktop=false\nvm=false'
test "$(classify 'packages/api/src/index.ts')" = $'desktop=false\nvm=false'
test "$(classify 'apps/web/src-tauri/src/main.rs')" = $'desktop=true\nvm=false'
test "$(classify 'package.json')" = $'desktop=true\nvm=true'
test "$(node "$classifier" --full </dev/null)" = $'desktop=true\nvm=true'

grep -Fq 'run: scripts/test-nix-verification.sh' "$workflow"
grep -Fq 'git diff --no-renames --name-only "$BASE_SHA...$HEAD_SHA" | node scripts/classify-nix-changes.mjs' "$workflow"
grep -Fq 'git diff --no-renames --name-only "$BEFORE_SHA" "${{ github.sha }}" | node scripts/classify-nix-changes.mjs' "$workflow"
grep -Fq 'node scripts/classify-nix-changes.mjs --full' "$workflow"
grep -Fq "if: github.event_name != 'pull_request' && needs.changes.outputs.desktop == 'true'" "$workflow"
grep -Fq "if: github.event_name != 'pull_request' && needs.changes.outputs.vm == 'true'" "$workflow"
grep -Fq "github.event_name == 'pull_request' &&" "$workflow"
grep -Fq 'run: nix flake check --no-build --print-build-logs' "$workflow"
grep -Fq 'nix build .#checks.x86_64-linux.desktop --print-build-logs' "$workflow"
grep -Fq '.#checks.x86_64-linux.module' "$workflow"
grep -Fq '.#checks.x86_64-linux.nixos-test' "$workflow"
grep -Fq 'name: Flake checks' "$workflow"
grep -Fq 'if: always()' "$workflow"
grep -Fq '[[ "$DESKTOP_REQUIRED" == "true" || "$DESKTOP_REQUIRED" == "false" ]]' "$workflow"
grep -Fq '[[ "$VM_REQUIRED" == "true" || "$VM_REQUIRED" == "false" ]]' "$workflow"
grep -Fq '[[ "$EVALUATE_RESULT" == "success" ]]' "$workflow"
grep -Fq 'upstream-cache: https://cache.nixos.org' "$workflow"
grep -Fq 'cancel-in-progress: true' "$workflow"
grep -Fq 'cron: "23 4 * * 1"' "$workflow"
if grep -Fq '    paths:' "$workflow"; then
  printf '%s\n' "The classifier must inspect every pull request and main push" >&2
  exit 1
fi
grep -Eq 'nix-installer-action@[0-9a-f]{40}' "$workflow"
grep -Eq 'magic-nix-cache-action@[0-9a-f]{40}' "$workflow"
grep -Fq 'Nix flake checks' "$report"
grep -Fq 'server package, desktop package, NixOS module closure, and NixOS VM integration test' "$report"
grep -Fq 'Dependency, Nix, and native desktop pull requests evaluate the affected flake outputs' "$report"
grep -Fq 'Ordinary application-source changes rely on the production-build gate' "$report"

printf '%s\n' "Nix verification policy tests passed"
