#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
workflow="$root/.github/workflows/quality.yml"

test -f "$workflow"
test "$(grep -Fc 'uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803' "$workflow")" -eq 6

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
if (scripts["quality:ci"] !== "bun run check && bun run quality && bun run openapi:check && bun run test:coverage") {
  throw new Error("quality:ci must run the read-only checks and coverage ratchet");
}
if (scripts["quality:architecture"] !== "bun scripts/check-architecture.ts") {
  throw new Error("quality:architecture must run the executable architecture policy");
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
grep -Fq 'needs: [install, static, types, build, e2e, database]' "$workflow"
grep -Fq 'if: ${{ always() }}' "$workflow"
grep -Fq 'needs.install.result' "$workflow"
grep -Fq 'needs.static.result' "$workflow"
grep -Fq 'needs.types.result' "$workflow"
grep -Fq 'needs.build.result' "$workflow"
grep -Fq 'needs.e2e.result' "$workflow"
grep -Fq 'bun run test:db' "$workflow"
grep -Fq 'needs.database.result' "$workflow"

grep -Fq 'useMaxParams' "$root/biome.json"
grep -Fq 'noExcessiveLinesPerFile' "$root/biome.json"
grep -Fq 'bun run quality:props' "$root/package.json"
grep -Fq 'bun run quality:fallow' "$root/package.json"
grep -Fq 'bun run quality:bundle' "$root/package.json"
grep -Fq 'check-web-bundle.ts' "$root/apps/web/package.json"
test -f "$root/config/web-bundle-budget.json"
bun test "$root/scripts/web-bundle-budget.test.ts"
grep -Fq 'bun run quality:architecture' "$root/package.json"
grep -Fq 'bun run quality:docs' "$root/package.json"
grep -Fq 'quality:docs' "$root/package.json"
grep -Fq 'check-architecture.ts' "$root/package.json"
grep -Fq 'bun run test:coverage' "$root/package.json"
grep -Fq 'check-coverage.ts' "$root/package.json"
grep -Fq '"test:e2e": "playwright test"' "$root/package.json"
grep -Fq '"test:e2e:ci": "CI=1 playwright test"' "$root/package.json"
test ! -e "$root/scripts/check-ui-primitives.mjs"

printf '%s\n' "Quality gate policy tests passed"
