# ADR 0003: Typed workflow kernel with leased checkpoints

Date: 2026-08-12

## Status

Accepted

## Context

Issue #34 ("Resume typed workflows after worker interruption") requires a
versioned typed workflow whose leased steps commit validated artifacts and
durable checkpoints, then resume idempotently after worker loss from the last
committed checkpoint. The parent destination (#30) records the selected model:
"Workflow execution uses versioned typed workflows with durable checkpoints,
attempts, leases, validated artifacts, declared human gates, budgets, routing
rationale, and executor adapters. Workers lease idempotent steps and may
commit only schema-valid, reference-valid, workflow-valid artifacts. Resume
begins at the last committed checkpoint."

This ADR records the kernel decision for the Phase 0 skeleton. Routing
rationale and executor adapters are out of scope for #34 and are deferred to
the phase that introduces real executors; the skeleton leaves a single
synthetic executor and no routing yet.

## Decision

The workflow kernel is a new module under `apps/server/src` backed by four
PostgreSQL tables:

- `workflow_definitions` — versioned, immutable typed workflow declarations.
- `workflow_runs` — one durable run; `current_step` is the index of the next
  step to lease. Identity is stable across interruption.
- `workflow_step_attempts` — one row per lease attempt. The committed attempt
  **is** the checkpoint; a trigger makes committed rows immutable, mirroring
  the synthetic-domain history invariant.
- `workflow_human_gates` — declared gates, durable and inspectable.

Issue #35 subsequently added `workflow_routing_decisions` as append-only
supporting history for the same run. It records a selected endpoint and
rationale before source-bearing work is retrieved, or the concrete choices
that paused a non-equivalent fallback. This extends the kernel's inspectable
history without changing checkpoint identity: a committed attempt remains the
checkpoint and `current_step` remains the resume position.

Artifact bytes and their authoritative metadata remain in the existing
`ArtifactRegistry` (content-addressed, from #33). A checkpoint records which
committed artifact is each step's result; the registry is the authority for
hash, policy, provenance, and references.

### Commit validity (three independent checks)

A worker may commit only:

- **schema-valid** artifacts — content conforms to the step's declared
  `artifactShape` (`validateArtifactShape`);
- **reference-valid** artifacts — references satisfy the step's
  `requiredReferences`, and content-addressed references resolve to registered
  artifacts (`resolveCrossReferences` against the registry);
- **workflow-valid** artifacts — the step is the run's current step, the lease
  is the active lease for the attempt, and the lease has not expired
  (`commitAttempt`, inside one transaction).

### Leasing, expiry, and resume

`claimNextStep` raises a new attempt when no active lease exists for the
current step; an expired lease is marked `expired` and a new attempt is raised.
`current_step` advances only on a committed checkpoint, so resume begins at
the last checkpoint, not at zero. A stale lease cannot commit (lease-id and
expiry checks), so worker loss never duplicates committed work. Re-committing
an already-committed attempt is idempotent.

The background executor leases only work steps (`claimNextStep({ onlyWork })`);
human gates are left for a human decision through the control plane.

### Rejected alternatives

- **Re-start-on-resume.** Rejected: the criterion requires resume from the last
  checkpoint.
- **Register artifact inside the checkpoint transaction.** Rejected: the
  registry owns its own pool and transaction. The artifact is content-addressed
  and registration is idempotent, so a commit that fails the workflow-valid
  checks leaves a harmless, deduplicated registered artifact with no
  checkpoint pointing at it; reconciliation reports it as registered.
- **A separate `checkpoints` table.** Rejected: the committed attempt **is** the
  checkpoint; a second table would duplicate the immutable history invariant
  already enforced on `workflow_step_attempts`.

## Consequences

- Committed checkpoints are database-enforced immutable; tampering raises at
  the boundary, like `synthetic_record_revisions`.
- Human gates are first-class, durable, and inspectable; a rejected gate fails
  the run (a future phase may add rewind rather than failure).
- Routing rationale is append-only run history and executor adapters are
  selected before a work lease. They do not change checkpoint identity or the
  lease/commit validity model.
