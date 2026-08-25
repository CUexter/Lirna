#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bun run --cwd "$root" test:sep:backend
bun run --cwd "$root" test:sep:frontend
bash "$root/scripts/test-postgres-integration.sh" without-sep-production
bun run --cwd "$root" test:sep:browser
