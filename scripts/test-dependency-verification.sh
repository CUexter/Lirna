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
cp "$root/scripts/verify-dependency-assessments.mjs" "$repo/scripts/"
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
const record = { package: "manual-fixture", version: "1.2.3", section: "dependencies", integrity: "sha512-synthetic", assessmentDate: "2026-08-13T00:00:00.000Z", requiredOverrides: [{ kind: "warnings", triggeredWarnings: ["low activity"] }] };
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
git -C "$repo" commit -q -m assessed-dependency
git -C "$repo" show HEAD^..HEAD --format= -- package.json package-lock.json >/dev/null
LIRNA_DEPENDENCY_PROJECT_ROOT="$repo" node "$repo/scripts/verify-dependency-assessments.mjs" --range HEAD^ HEAD

printf '%s\n' "dependency assessment verification disposable repository tests passed"
