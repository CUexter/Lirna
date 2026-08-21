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
test ! -e "$root/config/dependency-decisions"

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
git -C "$tmp/dependency-repo" add package.json bun.lock
LIRNA_DEPENDENCY_PROJECT_ROOT="$tmp/dependency-repo" bun "$root/scripts/verify-dependency-assessments.ts" --staged >/dev/null
node - "$tmp/dependency-repo" <<'NODE'
const fs = require("node:fs");
const root = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));
manifest.dependencies.ghost = "3.0.0";
fs.writeFileSync(`${root}/package.json`, `${JSON.stringify(manifest)}\n`);
NODE
git -C "$tmp/dependency-repo" add package.json
if LIRNA_DEPENDENCY_PROJECT_ROOT="$tmp/dependency-repo" bun "$root/scripts/verify-dependency-assessments.ts" --staged >"$tmp/dependency-violation.log" 2>&1; then
  printf '%s\n' 'dependency verifier accepted a hallucinated fixture' >&2
  exit 1
fi
grep -Fq 'missing an exact Bun lockfile entry' "$tmp/dependency-violation.log"

mkdir "$tmp/dependency-bin"
ln -s "$(command -v node)" "$tmp/dependency-bin/node"
ln -s "$(command -v bash)" "$tmp/dependency-bin/bash"
cat > "$tmp/dependency-bin/git" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'synthetic git failure' >&2
exit 128
EOF
chmod +x "$tmp/dependency-bin/git"
if PATH="$tmp/dependency-bin" LIRNA_DEPENDENCY_PROJECT_ROOT="$tmp/dependency-repo" bun "$root/scripts/verify-dependency-assessments.ts" --staged >"$tmp/dependency-tool-error.log" 2>&1; then
  printf '%s\n' 'dependency verifier swallowed a git tool error' >&2
  exit 1
fi
grep -Fq 'synthetic git failure' "$tmp/dependency-tool-error.log"

mkdir -p "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
ln -s "$(command -v bash)" "$tmp/bin/bash"
if PATH="$tmp/bin" /usr/bin/env bash "$root/scripts/secret-scan.sh" history >"$tmp/missing.log" 2>&1; then
  printf '%s\n' 'secret scanner did not fail closed when gitleaks was missing' >&2
  exit 1
fi

cat > "$tmp/bin/gitleaks" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GITLEAKS_TEST_LOG"
exit "${GITLEAKS_TEST_EXIT:-0}"
EOF
chmod +x "$tmp/bin/gitleaks"
GITLEAKS_TEST_LOG="$tmp/gitleaks.log" PATH="$tmp/bin" "$root/scripts/secret-scan.sh" history
GITLEAKS_TEST_LOG="$tmp/gitleaks.log" PATH="$tmp/bin" "$root/scripts/secret-scan.sh" commit deadbeef
if GITLEAKS_TEST_EXIT=23 GITLEAKS_TEST_LOG="$tmp/gitleaks.log" PATH="$tmp/bin" "$root/scripts/secret-scan.sh" staged; then
  printf '%s\n' 'secret scanner did not propagate a blocking finding' >&2
  exit 1
fi
grep -Fq "git --log-opts=--all --redact --config $root/.gitleaks.toml" "$tmp/gitleaks.log"
grep -Fq "git --log-opts=deadbeef^! --redact --config $root/.gitleaks.toml" "$tmp/gitleaks.log"
grep -Fq "git --staged --redact --config $root/.gitleaks.toml" "$tmp/gitleaks.log"

printf '%s\n' 'maintenance policy tests passed'
