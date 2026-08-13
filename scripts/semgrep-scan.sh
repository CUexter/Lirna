#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
case "${1:-blocking}" in
  blocking) exec semgrep --config "$root/config/semgrep/blocking.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude node_modules --exclude dist --error --metrics=off "$root" ;;
  report) semgrep --config "$root/config/semgrep/reporting.yml" --exclude config/semgrep/fixtures --exclude prototype --exclude node_modules --exclude dist --metrics=off "$root" || true ;;
  *) printf '%s\n' "Usage: $0 {blocking|report}" >&2; exit 2 ;;
esac
