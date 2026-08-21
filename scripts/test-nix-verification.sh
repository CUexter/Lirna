#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
flake="$root/flake.nix"
workflow="$root/.github/workflows/nix.yml"
classifier="$root/scripts/classify-nix-changes.ts"
output_paths="$root/config/nix-output-paths.json"
report="$root/docs/code-quality-standard.md"

test -f "$flake"
test -f "$workflow"
test -f "$classifier"
test -f "$output_paths"

grep -Fq 'checks.${system} = {' "$flake"
grep -Fq 'server = lirna;' "$flake"
grep -Fq 'desktop = lirnaDesktop;' "$flake"
grep -Fq 'module = (nixpkgs.lib.nixosSystem' "$flake"
grep -Fq 'nixosTest = import ./nix/test.nix' "$flake"
classify() {
  printf '%s\n' "$1" | bun "$classifier"
}

test "$(classify 'apps/web/src/routes/index.tsx')" = $'desktop=true\nvm=false'
test "$(classify 'apps/server/src/index.ts')" = $'desktop=false\nvm=true'
test "$(classify 'packages/api/src/index.ts')" = $'desktop=true\nvm=true'
test "$(classify 'config/web-bundle-budget.json')" = $'desktop=true\nvm=false'
test "$(classify 'scripts/check-web-bundle.ts')" = $'desktop=true\nvm=false'
test "$(classify 'README.md')" = $'desktop=false\nvm=false'
test "$(classify 'apps/web/src-tauri/src/main.rs')" = $'desktop=true\nvm=false'
test "$(classify 'package.json')" = $'desktop=true\nvm=true'
test "$(bun "$classifier" --full </dev/null)" = $'desktop=true\nvm=true'

grep -Fq 'run: scripts/test-nix-verification.sh' "$workflow"
grep -Fq 'git diff --no-renames --name-only "$BASE_SHA...$HEAD_SHA" | bun scripts/classify-nix-changes.ts' "$workflow"
grep -Fq 'git diff --no-renames --name-only "$BEFORE_SHA" "${{ github.sha }}" | bun scripts/classify-nix-changes.ts' "$workflow"
grep -Fq 'bun scripts/classify-nix-changes.ts --full' "$workflow"
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
grep -Fq 'Changes to inputs declared in `config/nix-output-paths.json` trigger whole-flake evaluation' "$report"
grep -Fq 'Classified pull requests evaluate the whole flake without' "$report"

printf '%s\n' "Nix verification policy tests passed"
