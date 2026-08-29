# Behavior tests and coverage

## Test surfaces

Tests should exercise behavior through the same public seam used by callers.
Prefer a focused test beside the module that owns the behavior. Use broader
integration or browser tests when the behavior exists only through composition
across modules.

Frontend route definitions and their support code live under
`apps/web/src/routes/`. Keep test harnesses, fixtures, and scenario modules
beside the owning module or under `apps/web/tests/routes` when route composition
is the public test surface.

Use synthetic fixtures. Tests must not depend on Vault content or other personal
material.

## Commands

Run the full Bun behavior suite:

```bash
bun test
```

Run focused frontend behavior tests:

```bash
bun run test:web
```

Run behavior tests with the coverage ratchet:

```bash
bun run test:coverage
```

The root scripts and test configuration are authoritative for runtime flags,
preloads, and test selection. Frontend unit-test environment decisions are
recorded in [ADR 0007](adr/0007-frontend-unit-tests-with-happy-dom.md).

## Coverage ratchet

Eligible application source must be covered or listed as a reviewed,
content-hashed exception in
[`config/coverage-baseline.json`](../config/coverage-baseline.json). Editing a
baselined file invalidates its exception, preventing the baseline from becoming
a permanent exclusion.

Use baseline commands only after reviewing why ordinary coverage is unsuitable:

```bash
bun run coverage:baseline
bun run coverage:promote
```

Promotion removes covered exceptions while preserving aggregate coverage floors.
For an explicitly reviewed source, use the scoped promotion option exposed by
`scripts/check-coverage.ts` rather than accepting unrelated baseline changes.

Coverage proves execution, not correctness. Review assertions, negative cases,
and failure behavior even when the ratchet passes.

## Mutation testing

Mutation testing checks whether assertions detect behavioral changes. Run the
application campaign with:

```bash
bun run test:mutation
```

The root scripts and Stryker configuration are authoritative for campaign
partitioning, source selection, and focused test lists. A surviving mutant is a
review prompt, not permission to weaken production behavior. Add a canonical Bun
assertion when the mutant exposes missing behavioral evidence; document why an
equivalent mutant cannot change observable behavior.

Mutation testing supplements the behavior suite and coverage ratchet. It does not
replace integration, browser, migration, security, or human interaction checks.
