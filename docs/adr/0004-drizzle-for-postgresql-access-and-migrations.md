# Drizzle for PostgreSQL access and migrations

Lirna uses Drizzle as the exclusive application data-access layer for canonical
server-side PostgreSQL and Drizzle Kit's code-first, committed migration history
instead of direct `pg` queries and runtime DDL. This removes handwritten query,
row-mapping, transaction, and migration boilerplate without turning database
rows into Lirna's domain model: modules retain domain-facing contracts and own
their transactions, while PostgreSQL remains authoritative for constraints,
locking, isolation, append-only history, leases, and other persistence
invariants.

## Status

Accepted

## Decision

- Drizzle schema declarations are colocated with their owning server modules and
  are the source of truth for tables, columns, indexes, checks, and foreign keys.
- Generated migrations are inspected, committed, and explicitly applied before
  API or worker startup. Startup checks migration state but never changes it;
  `drizzle-kit push` is not part of the workflow.
- Custom SQL migrations remain allowed for PostgreSQL functions, triggers, and
  DDL that Drizzle Kit cannot represent. Application code uses Drizzle's typed
  query API; a local, parameterized `sql` fragment is allowed only when Drizzle
  has no equivalent typed API.
- One application-owned Drizzle connection is injected through module-scoped
  interfaces. Direct application `pg.query` calls are forbidden, and crossing a
  schema-level foreign key does not grant one module authority to write another
  module's records.
- Drizzle's inferred storage types stay behind module boundaries. Rich `jsonb`
  values receive purpose-built runtime domain validation rather than relying on
  compile-time type assertions or table-derived validation.
- The initial cutover is atomic and preserves existing API behavior,
  transaction boundaries, locking semantics, and database-enforced invariants.
  It replaces the startup migration function with a clean baseline migration;
  existing development databases are treated as disposable unless they contain
  non-reconstructible data.
- Drizzle ORM and Drizzle Kit initially use the published
  `1.0.0-beta.2-6565b14` build and remain pinned to that exact build, with the
  lockfile committed, until stable `1.0.0`. That upgrade and later upgrades are deliberate and gated by
  clean-install, forward-migration, concurrency, invariant, integration, and
  end-to-end tests.

## Considered Options

- Keep direct `pg` access and the idempotent startup DDL function: rejected
  because schema evolution, row mappings, manual transactions, and raw SQL are
  already the main persistence friction.
- Adopt Drizzle only for ordinary CRUD while retaining direct `pg` queries for
  advanced operations: rejected because two application data-access conventions
  would preserve the mixing and boilerplate this decision is intended to remove.
- Treat Drizzle records and relations as domain entities: rejected because
  concepts such as Source state, Citation, Attempt, and Checkpoint have lifecycle
  meanings that are not equivalent to table rows or generic relation traversal.
- Eliminate SQL entirely: rejected because Lirna's accepted PostgreSQL-enforced
  invariants require functions, triggers, locks, and occasionally expressions
  outside Drizzle's typed API.

## Consequences

- Repositories remain only where they hide meaningful transactional rules or a
  domain-facing contract; CRUD-only forwarding wrappers should disappear.
- The PWA's recoverable offline replica/outbox is outside this decision and is
  not forced through a PostgreSQL-oriented abstraction.
- Migration tests must prove clean installation, safe forward migration,
  repeatable invocation, and preservation of append-only history, stale-lease
  rejection, concurrent claiming, transactional outbox writes, and checkpoint
  immutability.
