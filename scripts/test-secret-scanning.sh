#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
scanner="$root/scripts/secret-scan.sh"
hooks="$root/.githooks"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

new_repo() {
  local repo="$1"
  git init -q "$repo"
  git -C "$repo" config user.email test@example.invalid
  git -C "$repo" config user.name "Secret scanner test"
  mkdir -p "$repo/.githooks" "$repo/scripts"
  cp "$hooks/pre-commit" "$hooks/pre-push" "$repo/.githooks/"
  mkdir -p "$repo/config"
  cp "$root/config/gitleaks.toml" "$repo/config/"
  cp "$scanner" "$repo/scripts/"
  # The dependency verifier is required by the shared pre-commit hook.
  cp "$root/scripts/dependency-decisions.mjs" "$repo/scripts/"
  cp "$root/scripts/verify-dependency-assessments.mjs" "$repo/scripts/"
  cp "$root/config/dependency-assessment-policy.json" "$repo/config/"
  cat > "$repo/scripts/semgrep-scan.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SEMGREP_TEST_LOG"
EOF
  chmod +x "$repo/.githooks"/* "$repo/scripts/secret-scan.sh" "$repo/scripts/semgrep-scan.sh"
  git -C "$repo" config core.hooksPath .githooks
}

repo="$tmp/repo"
new_repo "$repo"
printf '{"name":"secret-fixture","version":"1.0.0","private":true}\n' > "$repo/package.json"
printf '{"name":"secret-fixture","lockfileVersion":3,"packages":{"":{"name":"secret-fixture","version":"1.0.0","private":true}}}\n' > "$repo/package-lock.json"
git -C "$repo" add package.json package-lock.json
git -C "$repo" commit -q -m initial
openssl genrsa 2048 > "$repo/secret.txt" 2>/dev/null
git -C "$repo" add secret.txt
if git -C "$repo" commit -m secret >"$tmp/commit.log" 2>&1; then
  printf '%s\n' "pre-commit did not block a synthetic secret" >&2
  exit 1
fi
grep -Eq 'Finding|leaks found' "$tmp/commit.log"

git -C "$repo" config core.hooksPath /dev/null
git -C "$repo" commit -q -m secret
git -C "$repo" config core.hooksPath .githooks
printf 'clean working tree\n' > "$repo/clean.txt"
git -C "$repo" add clean.txt
git -C "$repo" commit -q -m clean
git init -q --bare "$tmp/remote.git"
git -C "$repo" remote add origin "$tmp/remote.git"
if SEMGREP_TEST_LOG="$tmp/semgrep.log" git -C "$repo" push origin HEAD:main >"$tmp/push.log" 2>&1; then
  printf '%s\n' "pre-push did not scan an earlier outgoing commit" >&2
  exit 1
fi
grep -Eq 'Finding|leaks found' "$tmp/push.log"
grep -q '^blocking$' "$tmp/semgrep.log"
grep -q '^  schedule:' "$root/.github/workflows/checks.yml"
grep -q 'scripts/secret-scan.sh history' "$root/.github/workflows/checks.yml"

printf '%s\n' "secret-scanning disposable repository tests passed"
