#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
grep -v '^[[:space:]]*#' "$root/.github/workflows/checks.yml" | grep -Fq 'run: nix develop --command npm run check:trivy'
node -e 'const p=require(process.argv[1]); if(p.scripts["check:trivy"]!=="scripts/trivy-npm-scan.sh") process.exit(1)' "$root/package.json"
log="$tmp/trivy.log"
mkdir -p "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
ln -s "$(command -v bash)" "$tmp/bin/bash"
if PATH="$tmp/bin" /usr/bin/env bash "$root/scripts/trivy-npm-scan.sh" >"$tmp/missing-trivy.log" 2>&1; then
  printf '%s\n' "Trivy scan did not fail closed when the scanner was missing" >&2
  exit 1
fi
grep -q 'nix develop' "$tmp/missing-trivy.log"
cat > "$tmp/bin/trivy" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TRIVY_TEST_LOG"
[[ "$*" == *"--severity CRITICAL"* ]] && exit 1
exit 0
EOF
chmod +x "$tmp/bin/trivy"

if TRIVY_TEST_LOG="$log" PATH="$tmp/bin:$PATH" "$root/scripts/trivy-npm-scan.sh"; then
  printf '%s\n' "Trivy policy accepted a synthetic critical finding" >&2
  exit 1
fi
grep -q -- '--severity HIGH,CRITICAL' "$log"
grep -q -- '--severity CRITICAL' "$log"
if ! grep -q -- '--exit-code 1' "$log"; then
  printf '%s\n' "Trivy critical policy did not set a blocking exit code" >&2
  exit 1
fi

printf '%s\n' "Trivy npm vulnerability policy tests passed"
