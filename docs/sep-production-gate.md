# SEP production gate

The SEP production gate verifies the controlled first-class journey using
synthetic publication fragments. It must not read Vault content or retain
material fetched by the optional live check.

## Commands

Run one concern while diagnosing a failure:

```bash
bun run test:sep:backend
bun run test:sep:frontend
bun run test:sep:database
bun run test:sep:browser
```

Run the complete release gate with:

```bash
bun run test:sep:production
```

The root scripts, test files, and workflow are authoritative for the exact suites
and orchestration. A passing gate provides evidence only for the controlled
journey encoded there; it does not prove arbitrary publication compatibility.

## Controlled evidence

Fixtures use bounded synthetic prose and structural fragments. The journey should
cross the same public seams used for capture, Admission, immutable Source-state
evidence, typed Derivative generation and activation, the Reading workspace,
authored records, and Offline working sets.

Keep backend, frontend, database, and production-build browser evidence separable
so failures identify the responsible seam. Extend the gate when a release
invariant can only be proven through the complete journey; keep focused behavior
in the owning module's tests.

## Performance budgets

[`config/sep-production-budgets.json`](../config/sep-production-budgets.json) is
the single source of truth for controlled baselines and failing limits. Tests
measure at public seams and compare directly with that configuration.

Budget changes require a measured controlled run and a reason tied to user or
resource behavior. Do not copy numeric baselines into prose. A generous CI limit
absorbs shared-host noise; it must still reject hangs, payload explosions,
unbounded assets, and order-of-magnitude regressions.

## Optional live check

The live check detects publication-structure drift and is deliberately excluded
from deterministic CI. Run it only by explicit opt-in:

```bash
SEP_LIVE_CHECK=1 bun run test:sep:live
```

Use `SEP_LIVE_ENTRY_URL` only for an approved canonical entry on the supported
publication host. The executable check owns URL restrictions, redirect and byte
bounds, pacing, and the non-retention guarantee. Review those safeguards before
changing its target or scope.

Live-check failure means the publication structure or controlled expectations
need review. It is diagnostic evidence, not a deterministic release failure.
