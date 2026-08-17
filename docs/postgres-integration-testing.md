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
