# Shared development PostgreSQL service

## Status

Accepted

## Decision

- The registered primary checkout owns the Compose definition for one shared
  local PostgreSQL service, even when a linked worktree invokes it.
- `bun run lifecycle database start` always targets that primary checkout and
  waits for PostgreSQL health before reporting the stable `127.0.0.1:5433`
  endpoint. Repeating it is safe.
- `bun run lifecycle database diagnose` only observes Compose status. Its
  output excludes credentials and it reports an unreachable service with a
  nonzero exit code.
- The lifecycle command provides no shared-service shutdown operation. Stopping
  a process used by other worktrees requires an explicit operator action.

## Consequences

- Application worktrees share one local endpoint rather than starting isolated
  PostgreSQL containers.
- The registry must be registered before database lifecycle commands can locate
  the owning primary checkout.
