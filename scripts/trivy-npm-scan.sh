#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
if ! command -v trivy >/dev/null 2>&1 || [[ ! -x "$(command -v trivy)" ]]; then
  printf '%s\n' "Lirna dependency vulnerability scanning requires the pinned trivy from the Nix development shell." >&2
  printf '%s\n' "Enter this repository with: nix develop" >&2
  exit 127
fi
# Scan only committed lockfiles. Gitleaks owns secrets and this is not Nix/host coverage.
lockfiles=("$root/package-lock.json")
[[ -f "$root/prototype/visualization-relationship-editing/package-lock.json" ]] &&
  lockfiles+=("$root/prototype/visualization-relationship-editing/package-lock.json")
for lockfile in "${lockfiles[@]}"; do
  trivy fs --scanners vuln --pkg-types library --severity HIGH,CRITICAL --format table "$lockfile"
  trivy fs --scanners vuln --pkg-types library --severity CRITICAL --exit-code 1 --format table "$lockfile"
done
