#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
if ! command -v semgrep >/dev/null 2>&1 || [[ ! -x "$(command -v semgrep)" ]]; then
  printf '%s\n' "Lirna security scanning requires the pinned semgrep from the Nix development shell." >&2
  printf '%s\n' "Enter this repository with: nix develop" >&2
  exit 127
fi
case "${1:-blocking}" in
  blocking) exec semgrep --disable-version-check --no-git-ignore --config "$root/config/semgrep/blocking.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude lirna-legacy --exclude node_modules --exclude dist --error --jobs 1 --metrics=off "$root" ;;
  report) exec semgrep --disable-version-check --no-git-ignore --config "$root/config/semgrep/reporting.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude lirna-legacy --exclude node_modules --exclude dist --jobs 1 --metrics=off "$root" ;;
  *) printf '%s\n' "Usage: $0 {blocking|report}" >&2; exit 2 ;;
esac
