#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
if PATH="$tmp/bin" /usr/bin/env bash "$root/scripts/semgrep-scan.sh" blocking >"$tmp/missing-semgrep.log" 2>&1; then
  printf '%s\n' "Semgrep scan did not fail closed when the scanner was missing" >&2
  exit 1
fi
grep -q 'nix develop' "$tmp/missing-semgrep.log"
if semgrep --config "$root/config/semgrep/blocking.yml" --error --json --metrics=off "$root/config/semgrep/fixtures/unsafe.ts" >"$tmp/semgrep.json" 2>&1; then
  printf '%s\n' "Semgrep accepted synthetic blocking violations" >&2
  exit 1
fi
grep -q 'lirna-typescript-command-injection' "$tmp/semgrep.json"
grep -q 'lirna-typescript-sql-injection' "$tmp/semgrep.json"
grep -q 'lirna-typescript-unsafe-process-spawn' "$tmp/semgrep.json"
grep -q 'lirna-typescript-path-traversal' "$tmp/semgrep.json"
grep -q 'lirna-typescript-insecure-crypto' "$tmp/semgrep.json"
grep -q 'lirna-typescript-xss-sink' "$tmp/semgrep.json"
semgrep --config "$root/config/semgrep/blocking.yml" --error --metrics=off "$root/config/semgrep/fixtures/safe.ts" >/dev/null
printf '%s\n' "Semgrep security policy tests passed"
