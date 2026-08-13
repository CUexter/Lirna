#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if semgrep --config "$root/config/semgrep/blocking.yml" --error --json --metrics=off "$root/config/semgrep/fixtures/unsafe.ts" >"$tmp/semgrep.json" 2>&1; then
  printf '%s\n' "Semgrep accepted synthetic blocking violations" >&2
  exit 1
fi
grep -q 'lirna-typescript-command-injection' "$tmp/semgrep.json"
grep -q 'lirna-typescript-unsafe-process-spawn' "$tmp/semgrep.json"
grep -q 'lirna-typescript-path-traversal' "$tmp/semgrep.json"
grep -q 'lirna-typescript-insecure-crypto' "$tmp/semgrep.json"
grep -q 'lirna-typescript-xss-sink' "$tmp/semgrep.json"
semgrep --config "$root/config/semgrep/blocking.yml" --error --metrics=off "$root/config/semgrep/fixtures/safe.ts" >/dev/null
printf '%s\n' "Semgrep security policy tests passed"
