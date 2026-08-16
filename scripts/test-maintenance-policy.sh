#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

! git -C "$root" grep -n -E 'package-lock\.json|\.githooks|config/gitleaks\.toml|checks\.yml|npm run dependency' -- scripts .github docs ':!scripts/test-maintenance-policy.sh' >/dev/null
test -f "$root/bun.lock"
test -f "$root/.husky/pre-commit"
test -f "$root/.gitleaks.toml"
grep -Fq 'bun run secrets:staged' "$root/.husky/pre-commit"
grep -Fq 'run: bun run maintenance:test' "$root/.github/workflows/quality.yml"

mkdir "$tmp/dependency-repo"
git init -q "$tmp/dependency-repo"
git -C "$tmp/dependency-repo" config user.email test@example.invalid
git -C "$tmp/dependency-repo" config user.name maintenance-test
node - "$tmp/dependency-repo" <<'NODE'
const fs = require("node:fs");
const root = process.argv[2];
const manifest = { name: "fixture", version: "1.0.0", private: true, dependencies: { fixture: "1.0.0" } };
const lock = { lockfileVersion: 1, workspaces: { "": { dependencies: manifest.dependencies } }, packages: { fixture: ["fixture@1.0.0", "", {}, "sha512-fixture"] } };
fs.writeFileSync(`${root}/package.json`, `${JSON.stringify(manifest)}\n`);
fs.writeFileSync(`${root}/bun.lock`, `${JSON.stringify(lock)}\n`);
NODE
git -C "$tmp/dependency-repo" add package.json bun.lock
git -C "$tmp/dependency-repo" commit -q -m initial
node - "$tmp/dependency-repo" <<'NODE'
const fs = require("node:fs");
const root = process.argv[2];
const manifest = { name: "fixture", version: "1.0.0", private: true, dependencies: { fixture: "2.0.0" } };
const lock = { lockfileVersion: 1, workspaces: { "": { dependencies: manifest.dependencies } }, packages: { fixture: ["fixture@2.0.0", "", {}, "sha512-fixture-2"] } };
fs.writeFileSync(`${root}/package.json`, `${JSON.stringify(manifest)}\n`);
fs.writeFileSync(`${root}/bun.lock`, `${JSON.stringify(lock)}\n`);
NODE
mkdir -p "$tmp/dependency-repo/config/dependency-decisions"
printf '%s\n' '{"package":"fixture","version":"2.0.0","section":"dependencies","integrity":"sha512-fixture-2","assessmentDate":"2026-08-17","reason":"Synthetic fixture exercises the committed decision path."}' > "$tmp/dependency-repo/config/dependency-decisions/fixture@2.0.0.json"
git -C "$tmp/dependency-repo" add package.json bun.lock config
LIRNA_DEPENDENCY_PROJECT_ROOT="$tmp/dependency-repo" node "$root/scripts/verify-dependency-assessments.mjs" --staged >/dev/null
rm "$tmp/dependency-repo/config/dependency-decisions/fixture@2.0.0.json"
git -C "$tmp/dependency-repo" add config
if LIRNA_DEPENDENCY_PROJECT_ROOT="$tmp/dependency-repo" node "$root/scripts/verify-dependency-assessments.mjs" --staged >"$tmp/dependency-violation.log" 2>&1; then
  printf '%s\n' 'dependency verifier accepted an unassessed fixture' >&2
  exit 1
fi

mkdir -p "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
ln -s "$(command -v bash)" "$tmp/bin/bash"
if PATH="$tmp/bin" /usr/bin/env bash "$root/scripts/secret-scan.sh" history >"$tmp/missing.log" 2>&1; then
  printf '%s\n' 'secret scanner did not fail closed when gitleaks was missing' >&2
  exit 1
fi

mkdir "$tmp/repo"
git init -q "$tmp/repo"
cp "$root/.gitleaks.toml" "$tmp/repo/.gitleaks.toml"
git -C "$tmp/repo" config user.email test@example.invalid
git -C "$tmp/repo" config user.name maintenance-test
printf '%s\n' safe > "$tmp/repo/safe.txt"
git -C "$tmp/repo" add safe.txt
git -C "$tmp/repo" commit -q -m safe
(cd "$tmp/repo" && "$root/scripts/secret-scan.sh" commit "$(git rev-parse HEAD)") >/dev/null
openssl genrsa 2048 > "$tmp/repo/violation.txt" 2>/dev/null
git -C "$tmp/repo" add violation.txt
if (cd "$tmp/repo" && "$root/scripts/secret-scan.sh" staged) >"$tmp/violation.log" 2>&1; then
  printf '%s\n' 'secret scanner accepted a violating fixture' >&2
  exit 1
fi

printf '%s\n' 'maintenance policy tests passed'
