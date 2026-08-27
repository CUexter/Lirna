#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
log="$tmp/trivy.log"
mkdir -p "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
ln -s "$(command -v bash)" "$tmp/bin/bash"
if PATH="$tmp/bin" /usr/bin/env bash "$root/scripts/trivy-scan.sh" config >"$tmp/missing-trivy.log" 2>&1; then
  printf '%s\n' "Trivy scan did not fail closed when the scanner was missing" >&2
  exit 1
fi
grep -q 'nix develop' "$tmp/missing-trivy.log"
cat > "$tmp/bin/trivy" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TRIVY_TEST_LOG"
exit "${TRIVY_TEST_EXIT:-0}"
EOF
chmod +x "$tmp/bin/trivy"

TRIVY_TEST_LOG="$log" PATH="$tmp/bin:$PATH" "$root/scripts/trivy-scan.sh" config
TRIVY_TEST_LOG="$log" PATH="$tmp/bin:$PATH" "$root/scripts/trivy-scan.sh" dependencies
TRIVY_TEST_LOG="$log" PATH="$tmp/bin:$PATH" "$root/scripts/trivy-scan.sh" image lirna-server:test
if TRIVY_TEST_EXIT=23 TRIVY_TEST_LOG="$log" PATH="$tmp/bin:$PATH" "$root/scripts/trivy-scan.sh" dependencies; then
  printf '%s\n' "Trivy scan did not propagate a blocking finding" >&2
  exit 1
fi

grep -Fq 'config --severity HIGH,CRITICAL --exit-code 1 --skip-dirs **/node_modules --skip-dirs .stryker-tmp --skip-dirs .worktrees --skip-dirs prototype --skip-dirs lirna-legacy --disable-telemetry --skip-version-check' "$log"
grep -Fq 'fs --scanners vuln --pkg-types library --include-dev-deps --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --skip-dirs **/node_modules --skip-dirs .stryker-tmp --skip-dirs .worktrees --skip-dirs prototype --skip-dirs lirna-legacy --disable-telemetry --skip-version-check' "$log"
grep -Fq 'image --scanners vuln --pkg-types os,library --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --disable-telemetry --skip-version-check lirna-server:test' "$log"

workflow="$root/.github/workflows/trivy.yml"
grep -Fq 'aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514' "$workflow"
grep -Fq 'version: v0.73.0' "$workflow"
grep -Fq 'uses: oven-sh/setup-bun@v2' "$workflow"
grep -Fq 'bun-version-file: package.json' "$workflow"
grep -Fq 'dockerfile: apps/server/Dockerfile' "$workflow"
grep -Fq 'dockerfile: apps/web/Dockerfile' "$workflow"
grep -Fq 'run: scripts/test-trivy-policy.sh' "$workflow"
grep -Fq 'run: bun run security:trivy:config' "$workflow"
grep -Fq 'run: bun run security:trivy:dependencies' "$workflow"
grep -Fq 'run: scripts/trivy-scan.sh image "${{ matrix.image }}"' "$workflow"

printf '%s\n' "Trivy security policy tests passed"
