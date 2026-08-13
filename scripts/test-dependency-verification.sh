#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
git init -q "$repo"
git -C "$repo" config user.email test@example.invalid
git -C "$repo" config user.name "Dependency verification test"
mkdir -p "$repo/scripts" "$repo/.githooks"
cp "$root/scripts/dependency-decisions.mjs" "$repo/scripts/"
cp "$root/scripts/verify-dependency-assessments.mjs" "$repo/scripts/"
mkdir -p "$repo/config"
cp "$root/config/dependency-assessment-policy.json" "$repo/config/"
cp "$root/.githooks/pre-commit" "$repo/.githooks/"
cat > "$repo/scripts/secret-scan.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$repo/scripts/secret-scan.sh"
git -C "$repo" config core.hooksPath .githooks

node --input-type=module - "$repo" <<'NODE'
import { writeFile } from "node:fs/promises";
const root = process.argv[2];
const manifest = { name: "fixture", version: "1.0.0", private: true };
const lock = { name: "fixture", lockfileVersion: 3, requires: true, packages: { "": manifest } };
await writeFile(`${root}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${root}/package-lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
NODE
git -C "$repo" add package.json package-lock.json
git -C "$repo" commit -q -m initial

node --input-type=module - "$repo" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const root = process.argv[2];
const manifest = JSON.parse(await readFile(`${root}/package.json`));
const lock = JSON.parse(await readFile(`${root}/package-lock.json`));
manifest.dependencies = { "manual-fixture": "1.2.3" };
lock.packages[""].dependencies = manifest.dependencies;
lock.packages["node_modules/manual-fixture"] = { version: "1.2.3", resolved: "https://registry.example/manual-fixture-1.2.3.tgz", integrity: "sha512-synthetic" };
await writeFile(`${root}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${root}/package-lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
NODE
git -C "$repo" add package.json package-lock.json
if git -C "$repo" commit -m manual-dependency >"$tmp/manual.log" 2>&1; then
  printf '%s\n' "pre-commit accepted an unassessed manual dependency" >&2
  exit 1
fi
grep -q 'unassessed direct dependency manual-fixture@1.2.3' "$tmp/manual.log"

mkdir -p "$repo/config/dependency-decisions"
node --input-type=module - "$repo" <<'NODE'
import { writeFile } from "node:fs/promises";
const record = { package: "manual-fixture", version: "1.2.3", section: "dependencies", integrity: "sha512-synthetic", archiveSha512: "A".repeat(86) + "==", assessmentVersion: 1, assessmentDate: new Date().toISOString(), tarballUrl: "https://example.invalid/manual-fixture.tgz", requiredOverrides: [{ kind: "warnings", triggeredWarnings: ["low activity"] }] };
await writeFile(`${process.argv[2]}/config/dependency-decisions/manual-fixture@1.2.3.assessment.json`, `${JSON.stringify(record, null, 2)}\n`);
NODE
git -C "$repo" add config package.json package-lock.json
if git -C "$repo" commit -m missing-override >"$tmp/override.log" 2>&1; then
  printf '%s\n' "pre-commit accepted assessment evidence without its required override" >&2
  exit 1
fi
grep -q 'requires its exact warnings record' "$tmp/override.log"

node --input-type=module - "$repo" <<'NODE'
import { writeFile } from "node:fs/promises";
const warning = { package: "manual-fixture", version: "1.2.3", triggeredWarnings: ["low activity"] };
await writeFile(`${process.argv[2]}/config/dependency-decisions/manual-fixture@1.2.3.warnings.json`, `${JSON.stringify(warning, null, 2)}\n`);
NODE
git -C "$repo" add config package.json package-lock.json
if git -C "$repo" commit -m incomplete-warning >"$tmp/incomplete-warning.log" 2>&1; then
  printf '%s\n' "pre-commit accepted an incomplete warning override" >&2
  exit 1
fi
grep -q 'package-specific reason' "$tmp/incomplete-warning.log"

node --input-type=module - "$repo" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const path = `${process.argv[2]}/config/dependency-decisions/manual-fixture@1.2.3.warnings.json`;
const warning = JSON.parse(await readFile(path));
warning.assessmentDate = new Date().toISOString();
warning.officialSourceUrl = "https://example.invalid/manual-fixture";
warning.reason = "Synthetic fixture selected for dependency verification coverage.";
await writeFile(path, `${JSON.stringify(warning, null, 2)}\n`);
NODE
git -C "$repo" add config package.json package-lock.json
git -C "$repo" commit -q -m assessed-dependency
git -C "$repo" show HEAD^..HEAD --format= -- package.json package-lock.json >/dev/null
LIRNA_DEPENDENCY_PROJECT_ROOT="$repo" node "$repo/scripts/verify-dependency-assessments.mjs" --range HEAD^ HEAD

node --input-type=module - "$repo" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const root = process.argv[2];
const manifest = JSON.parse(await readFile(`${root}/package.json`));
const lock = JSON.parse(await readFile(`${root}/package-lock.json`));
manifest.dependencies["critical-fixture"] = "2.0.0";
lock.packages[""].dependencies = manifest.dependencies;
lock.packages["node_modules/critical-fixture"] = { version: "2.0.0", integrity: "sha512-critical-synthetic" };
const assessment = { package: "critical-fixture", version: "2.0.0", section: "dependencies", integrity: "sha512-critical-synthetic", archiveSha512: "A".repeat(86) + "==", assessmentVersion: 1, assessmentDate: new Date().toISOString(), tarballUrl: "https://example.invalid/critical-fixture.tgz", requiredOverrides: [{ kind: "critical-vulnerabilities", vulnerabilityIds: ["OSV-SYNTHETIC"] }] };
const exception = { package: "critical-fixture", version: "2.0.0", assessmentDate: new Date().toISOString(), reason: "Synthetic critical exception for author verification.", vulnerabilityIds: ["OSV-SYNTHETIC"] };
await writeFile(`${root}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(`${root}/package-lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
await writeFile(`${root}/config/dependency-decisions/critical-fixture@2.0.0.assessment.json`, `${JSON.stringify(assessment, null, 2)}\n`);
await writeFile(`${root}/config/dependency-decisions/critical-fixture@2.0.0.critical-vulnerabilities.json`, `${JSON.stringify(exception, null, 2)}\n`);
NODE
git -C "$repo" add config package.json package-lock.json
if git -C "$repo" commit -m forged-critical-exception >"$tmp/critical-author.log" 2>&1; then
  printf '%s\n' "pre-commit accepted a critical exception not authored by Nathan" >&2
  exit 1
fi
grep -q 'critical exception must be committed by Nathan' "$tmp/critical-author.log"
git -C "$repo" config user.email nathan.chan@net-makers.com.hk
git -C "$repo" config user.name Nathan
git -C "$repo" commit -q -m nathan-critical-exception
LIRNA_DEPENDENCY_PROJECT_ROOT="$repo" node "$repo/scripts/verify-dependency-assessments.mjs" --range HEAD^ HEAD
grep -q 'git merge-base "origin/$DEFAULT_BRANCH"' "$root/.github/workflows/checks.yml"

printf '%s\n' "dependency assessment verification disposable repository tests passed"
