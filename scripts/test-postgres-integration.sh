#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_dir="$root/packages/db"
run_id="$$-${RANDOM}"
drift_dir="$db_dir/.migration-drift-$run_id"
container=""

cleanup() {
  rm -rf "$drift_dir"
  if [[ -n "$container" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir "$drift_dir"
cp -R "$db_dir/src/migrations" "$drift_dir/migrations"

(
  cd "$db_dir"
  bunx drizzle-kit check --dialect postgresql --out ".migration-drift-$run_id/migrations"
  bunx drizzle-kit generate \
    --dialect postgresql \
    --schema ./src/schema \
    --out ".migration-drift-$run_id/migrations" \
    --name drift_check
)

node - "$db_dir/src/migrations" <<'NODE'
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const migrations = process.argv[2];
const journal = JSON.parse(
  readFileSync(join(migrations, "meta", "_journal.json"), "utf8"),
);
const expected = journal.entries.map(({ tag }) => `${tag}.sql`).sort();
const actual = readdirSync(migrations)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(
    `Migration journal mismatch. Expected ${expected.join(", ")}; found ${actual.join(", ")}`,
  );
}
NODE

if ! diff -qr "$db_dir/src/migrations" "$drift_dir/migrations" >/dev/null; then
  printf '%s\n' \
    "Database schema drift detected." \
    "Run 'bun run db:generate', review the generated migration, and commit it." >&2
  exit 1
fi

if [[ -z "${POSTGRES_ADMIN_URL:-}" ]]; then
  command -v docker >/dev/null 2>&1 || {
    printf '%s\n' \
      "Docker is required when POSTGRES_ADMIN_URL is not set." \
      "See docs/postgres-integration-testing.md for local setup." >&2
    exit 1
  }

  container="lirna-postgres-integration-$run_id"
  password="lirna-integration-$run_id"
  docker run --detach --rm \
    --name "$container" \
    --env POSTGRES_PASSWORD="$password" \
    --publish 127.0.0.1::5432 \
    postgres:17@sha256:e38411452a464af89e5adadb8d223bf53b898d47d6ef918b2d58c08707350449 >/dev/null

  for _ in {1..30}; do
    if docker exec "$container" pg_isready --username postgres >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker exec "$container" pg_isready --username postgres >/dev/null 2>&1; then
    docker logs "$container" >&2
    printf '%s\n' "Disposable PostgreSQL did not become ready within 30 seconds." >&2
    exit 1
  fi

  port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$container")"
  POSTGRES_ADMIN_URL="postgresql://postgres:${password}@127.0.0.1:${port}/postgres"
fi

POSTGRES_ADMIN_URL="$POSTGRES_ADMIN_URL" \
  bun test "$db_dir/src/postgres.integration.test.ts" --timeout 30000

POSTGRES_ADMIN_URL="$POSTGRES_ADMIN_URL" \
  bun test \
    "$db_dir/scripts/provision-managed-database.postgres.test.ts" \
    --timeout 30000

POSTGRES_ADMIN_URL="$POSTGRES_ADMIN_URL" \
  bun test \
    "$root/packages/api/src/sep-admission/sep-preview-store.postgres.test.ts" \
    "$root/packages/api/src/sep-admission/sep-admission-admit.postgres.test.ts" \
    "$root/packages/api/src/sep-admission/sep-admitted-state-reader.postgres.test.ts" \
    --timeout 30000

POSTGRES_ADMIN_URL="$POSTGRES_ADMIN_URL" \
  bun test "$root/packages/api/src/annotations/annotation-store.postgres.test.ts" --timeout 30000
