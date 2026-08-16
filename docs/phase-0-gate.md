# Phase 0 gate result

Date: 2026-08-12

Tracks issue #36 ("Prove the Phase 0 invariants"), the architecture-skeleton
gate for the destination in #30. This document is the gate's recorded result:
what was proven, how, and the known limitations handed to the next phase.

## Historical result

**Passed.** One reproducible body of evidence covers the riskiest Phase 0
authority, durability, artifact, workflow, and policy promises. It is produced
through a single application scenario seam against disposable real
infrastructure and runs in local development and CI.

The original Phase 0 evidence was produced in an earlier checkout. Its test
harness is not part of the current repository and is not presented as a command
that can be rerun here. No private Vault material (`~/vaults`) was read or
written; the original fixtures were synthetic, non-sensitive bytes.

## What the gate proves

Each acceptance-criterion promise is driven through the seam that can isolate
it: the HTTP control plane where the promise is observable there, and the owning
module contract for the transactional-outbox properties HTTP cannot isolate.

| Promise (from #36) | Evidence | Seam |
|---|---|---|
| Stable identity + immutable history + outbox event per revision commit together | revise twice over HTTP; read one stable id, history `[1,2]`, events `[1,2]` | HTTP `/api/synthetic-records` |
| Module write ownership | a second module's write is refused (409) with no partial write | HTTP |
| Transaction atomicity (roll back together) | a fault injected before the outbox write rolls back state, history, and outbox | domain module contract (`beforeOutbox`) |
| Immutable history at the database boundary | a direct `UPDATE` on recorded history raises `append-only` | domain pool |
| Outbox delivery is retry-safe | committed publications are skipped; a failure after publication redelivers the same stable event id for consumer deduplication | `OutboxRelay` |
| Artifact identity + reconciliation | identical bytes resolve to one identity; missing / unexpected / hash-mismatch are reported without silent repair | `ArtifactRegistry` + store |
| Invalid-artifact rejection | a schema-invalid commit is refused (`ArtifactValidationError`) | workflow run contract |
| Policy denial (Source handling) | routing omits `inaccessible` evidence before work commits and discloses the omission rather than silently using it | routed workflow + executor |
| Workflow decision validation | invalid and out-of-turn gate decisions are refused (400 / 409) | HTTP `/gates/:step/decision` |
| Public application operation | a submitted operation is claimed by the worker, written to the store and synthetic Vault, and observed completed through the control plane | HTTP `/api/operations` + worker |
| Worker loss + lease expiry | a lost lease expires; a restarted worker raises a new attempt and commits exactly one checkpoint | HTTP + executor + spawned executor |
| Idempotent recommit | re-committing an already-committed Attempt is a no-op that duplicates no work | workflow run contract |
| Checkpoint resume | the run resumes at the last committed checkpoint, not at zero | HTTP + executor |
| Policy-aware executor routing | the actual eligible endpoint is recorded and local execution is preferred before work commits | routed workflow + executor |

## Known limitations handed to the next phase

- **Synthetic domain only.** The invariants are proven on the synthetic record,
  operation, artifact, and workflow objects of the skeleton. Real product
  objects (Sources, Renditions, Owned notes, Drafts, and so on) are not yet
  modelled; the next phase must re-establish these invariants as it introduces
  them.
- **Transactional-outbox atomicity is proven at the module contract, not over
  HTTP.** The injected-fault rollback and the append-only database boundary
  cannot be isolated through the control plane, so the gate drives them through
  the owning module contract within the same booted scenario.
- **Outbox delivery is at least once, not exactly once.** A process failure after
  an external consumer accepts an event but before PostgreSQL records publication
  can redeliver it. Event ids are stable so consumers can deduplicate safely.
- **No private Vault adapter and no real executors.** The scenario uses a
  synthetic filesystem Vault adapter and a single local synthetic executor. The
  policy-routing evidence exercises eligibility, local preference, and evidence
  disclosure, but not a real cloud executor, real fallback equivalence over the
  network, or real content retrieval.
- **Single-node PostgreSQL.** Durability is proven against one disposable
  database; multi-node failover, backup/restore, and at-rest protection are
  separate later concerns (#44, #45, #18).
- **The operation roundtrip writes bytes through the store, not the registry.**
  The public application operation (proven end to end in the gate) writes its
  artifact straight to the content-addressed store, so those bytes are
  "unexpected" from the registry's point of view. The gate therefore asserts
  specific hashes in each reconciliation category rather than a globally empty
  report. Unifying operation artifacts under the registry is a future
  consolidation, not a Phase 0 gate requirement.
