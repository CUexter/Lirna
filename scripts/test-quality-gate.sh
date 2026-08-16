#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
workflow="$root/.github/workflows/quality.yml"

test -f "$workflow"

node - "$root/package.json" <<'NODE'
const fs = require("node:fs");

const packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const scripts = packageJson.scripts;

if (scripts.check !== "biome check .") {
  throw new Error("check must be the read-only Biome verification command");
}
if (scripts["check:fix"] !== "biome check --write .") {
  throw new Error("check:fix must be the explicitly mutating Biome command");
}
if (scripts["quality:ci"] !== "bun run check && bun run quality && bun run test:coverage") {
  throw new Error("quality:ci must run the read-only checks and coverage ratchet");
}
NODE

grep -Fq 'bun install --frozen-lockfile' "$workflow"
grep -Fq 'run: bun run quality:ci' "$workflow"
grep -Fq 'run: bun run check-types' "$workflow"
grep -Fq 'run: bun run build' "$workflow"
grep -Fq 'run: bun run test:e2e:ci' "$workflow"
grep -Fq 'bunx playwright install --with-deps firefox' "$workflow"
grep -Fq 'name: Quality' "$workflow"
grep -Fq 'name: quality' "$workflow"
grep -Fq 'needs: [install, static, types, build, e2e]' "$workflow"
grep -Fq 'if: ${{ always() }}' "$workflow"
grep -Fq 'needs.install.result' "$workflow"
grep -Fq 'needs.static.result' "$workflow"
grep -Fq 'needs.types.result' "$workflow"
grep -Fq 'needs.build.result' "$workflow"
grep -Fq 'needs.e2e.result' "$workflow"

grep -Fq 'noExcessiveCognitiveComplexity' "$root/biome.json"
grep -Fq 'useMaxParams' "$root/biome.json"
grep -Fq 'noExcessiveLinesPerFile' "$root/biome.json"
grep -Fq 'bun run test:coverage' "$root/package.json"
grep -Fq 'check-coverage.mjs' "$root/package.json"
grep -Fq 'bun run quality:props' "$root/package.json"
grep -Fq 'bun run quality:duplication' "$root/package.json"
grep -Fq 'bun run quality:docs' "$root/package.json"
grep -Fq 'quality:docs' "$root/package.json"
grep -Fq '"test:e2e": "playwright test"' "$root/package.json"
grep -Fq '"test:e2e:ci": "CI=1 playwright test"' "$root/package.json"
test -f "$root/scripts/e2e-api-substitute.mjs"
test -f "$root/tests/e2e/app-shell.spec.ts"

printf '%s\n' "Quality gate policy tests passed"
