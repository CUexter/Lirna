#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
if ! command -v semgrep >/dev/null 2>&1 || [[ ! -x "$(command -v semgrep)" ]]; then
  printf '%s\n' "Lirna security scanning requires the pinned semgrep from the Nix development shell." >&2
  printf '%s\n' "Enter this repository with: nix develop" >&2
  exit 127
fi
case "${1:-blocking}" in
  blocking) exec semgrep --config "$root/config/semgrep/blocking.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude node_modules --exclude dist --error --metrics=off "$root" ;;
  report) semgrep --config "$root/config/semgrep/reporting.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude node_modules --exclude dist --metrics=off "$root" || true ;;
  *) printf '%s\n' "Usage: $0 {blocking|report}" >&2; exit 2 ;;
esac
