# PostgreSQL Integration Testing

Run the migration and repository integration suite from the repository root:

```bash
bun run test:db
```

By default the command starts a digest-pinned disposable PostgreSQL 18 container
with a generated test-only password and a random host port. The test creates a
uniquely named database, applies every migration under
`packages/db/src/migrations/`, exercises a write and read through the exported
database seam used by callers, verifies the unique-email constraint, drops the
database, and removes the container. It does not read `apps/server/.env`, use the
development database, or access Vault content. Repeated and parallel runs use
separate containers and database names.

Docker must be installed and the daemon must be running. To use an existing
throwaway PostgreSQL server instead, provide an administrator URL through the
environment without writing it to a tracked file:

```bash
read -rs POSTGRES_PASSWORD
export POSTGRES_ADMIN_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres"
unset POSTGRES_PASSWORD
bun run test:db
unset POSTGRES_ADMIN_URL
```

The administrator must be allowed to create and drop databases. The command
never migrates the database named in `POSTGRES_ADMIN_URL`; it creates a unique
child database and removes it after the run. Use only a local or otherwise
disposable server, not production credentials.

## Deployment Compatibility and Recovery

`0000_initial_auth_schema.sql` is the clean baseline for the four Better Auth
tables. It creates new tables, indexes, and foreign keys and does not alter or
delete existing application data. Apply it before starting an application
release that expects these tables.

The baseline is not compatible with a database where any of those tables were
created outside the committed migration history. Recreate a disposable database.
For non-reconstructible data, stop deployment, take and verify a backup, and
write a separately reviewed forward migration that reconciles the existing
schema and preserves its rows; do not mark the baseline as applied manually.

There is intentionally no automatic down migration. Prefer rolling the
application back while leaving this additive schema in place, after confirming
the previous release accepts the same auth-table contract. If the schema itself
must be removed, stop all writers, take and test a restorable backup, then remove
`account` and `session` before `user` because of their foreign keys;
`verification` is independent. Dropping these tables destroys authentication
and session data, so restore the backup rather than attempting schema rollback
when that data must be retained.

## Failure Diagnosis

- `Docker is required` means Docker is unavailable and no
  `POSTGRES_ADMIN_URL` was supplied.
- A readiness timeout means the container could not start. Run `docker ps -a`
  and check Docker daemon capacity and PostgreSQL image availability.
- `permission denied to create database` means the supplied administrator lacks
  `CREATEDB`; use the default container path or a suitable disposable role.
- `Database schema drift detected` or `Migrated database differs` means the
  TypeScript schema, committed migration snapshots, and resulting database do
  not agree. Run `bun run db:generate`, review the SQL, and commit the migration
  and its `meta/` snapshot.
- A migration error identifies a committed migration that cannot build an empty
  database. The disposable database is removed automatically; rerun after fixing
  the migration history.
- A repository assertion failure means migrations succeeded but the
  caller-facing database behavior or constraint changed. The Bun failure output
  identifies the changed contract.
