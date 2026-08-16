#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
if ! command -v trivy >/dev/null 2>&1 || [[ ! -x "$(command -v trivy)" ]]; then
  printf '%s\n' "Lirna security scanning requires the pinned trivy from the Nix development shell." >&2
  printf '%s\n' "Enter this repository with: nix develop" >&2
  exit 127
fi

case "${1:-}" in
  config)
    exec trivy config \
      --severity HIGH,CRITICAL \
      --exit-code 1 \
      --skip-dirs '**/node_modules' \
      --skip-dirs prototype \
      --skip-dirs lirna-legacy \
      --disable-telemetry \
      --skip-version-check \
      "$root"
    ;;
  dependencies)
    exec trivy fs \
      --scanners vuln \
      --pkg-types library \
      --include-dev-deps \
      --severity HIGH,CRITICAL \
      --ignore-unfixed \
      --exit-code 1 \
      --skip-dirs '**/node_modules' \
      --skip-dirs prototype \
      --skip-dirs lirna-legacy \
      --disable-telemetry \
      --skip-version-check \
      "$root"
    ;;
  image)
    if [[ $# -ne 2 ]]; then
      printf '%s\n' "Usage: $0 image IMAGE" >&2
      exit 2
    fi
    exec trivy image \
      --scanners vuln \
      --pkg-types os,library \
      --severity HIGH,CRITICAL \
      --ignore-unfixed \
      --exit-code 1 \
      --disable-telemetry \
      --skip-version-check \
      "$2"
    ;;
  *)
    printf '%s\n' "Usage: $0 {config|dependencies|image IMAGE}" >&2
    exit 2
    ;;
esac
