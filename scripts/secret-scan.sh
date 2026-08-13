#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
config="$root/config/gitleaks.toml"

if ! command -v gitleaks >/dev/null 2>&1 || [[ ! -x "$(command -v gitleaks)" ]]; then
  printf '%s\n' "Lirna secret scanning requires the pinned gitleaks from the Nix development shell." >&2
  printf '%s\n' "Enter this repository with: nix develop" >&2
  exit 127
fi

if [[ ! -f "$config" ]]; then
  printf '%s\n' "Missing repository-owned config/gitleaks.toml; refusing to continue." >&2
  exit 1
fi

case "${1:-}" in
  staged)
    git diff --cached --binary | exec gitleaks stdin --redact --config "$config"
    ;;
  commit)
    shift
    [[ $# -eq 1 ]] || { printf '%s\n' "Usage: $0 commit COMMIT" >&2; exit 2; }
    exec gitleaks git --log-opts="$1^!" --redact --config "$config"
    ;;
  range)
    shift
    [[ $# -eq 2 ]] || { printf '%s\n' "Usage: $0 range OLD NEW" >&2; exit 2; }
    old=$1
    new=$2
    [[ "$new" =~ ^0+$ ]] && exit 0
    if [[ "$old" =~ ^0+$ ]]; then commits=$(git rev-list "$new"); else commits=$(git rev-list "$old..$new"); fi
    while IFS= read -r commit; do
      [[ -z "$commit" ]] && continue
      "$0" commit "$commit"
    done <<< "$commits"
    ;;
  history)
    exec gitleaks git --log-opts="--all" --redact --config "$config"
    ;;
  *)
    printf '%s\n' "Usage: $0 {staged|commit COMMIT|range OLD NEW|history}" >&2
    exit 2
    ;;
esac
