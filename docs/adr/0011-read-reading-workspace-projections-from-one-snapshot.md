# Read Reading workspace projections from one snapshot

## Status

Accepted

## Context

A server Reading workspace projection combines one Source, one Source state, the
active Reading Derivative, its activation history, and Citation resolutions.
These records can change while a projection is being read. Independent reads can
therefore produce a result that did not exist at one point in time.

The active Reading Derivative module already owns selection and activation
invariants. It does not own the complete Reading workspace projection. Authored
writes and Reading Derivative activation protect different invariants and must
remain behind their existing seams.

Lirna has no released legacy Source data. Development databases will be reset
before 1.0, so a legacy Reading fallback has no compatibility value.

## Decision

Place the server Reading workspace projection behind one external seam. Its
implementation owns a read-only, repeatable-read transaction and reads the
requested Source summary, Source state, active Reading Derivative, activation
history, and Citation resolutions from that transaction's snapshot.

The active Reading Derivative module remains separate. The projection
implementation uses its snapshot-aware selection as an internal seam. Citation
resolution creation and clearing, Reading Derivative activation, Annotations,
reading positions, client opening, and retained hydration remain outside the
module.

Both online Reading workspace delivery and Offline working-set assembly use the
external seam. The Offline working-set procedure continues to assemble its
Annotations and reading positions separately.

The module returns one unavailable result when the Source is missing, the Source
state does not belong to it, or no active Reading Derivative exists. It preserves
the current projection shape and does not support a legacy Source fallback.

## Considered Options

### Compose existing reads behind a new seam

Rejected. This would hide orchestration but would not give the module ownership
of one snapshot. Its Interface could not promise the required consistency.

### Put transaction-aware reads in the procedure

Rejected. The procedure and Offline working-set assembly would both learn the
snapshot rule. Deleting a dedicated projection module would make that complexity
reappear across both callers, so the module provides real Depth and Locality.

### Expand the admitted-state module

Rejected. That module already lists and deletes Sources, reads Source states and
Reading Derivatives, and selects update targets. Adding the full Reading
workspace projection would enlarge a shallow Interface.

## Consequences

- One Reading workspace projection represents one database observation.
- Database transaction details stay in the implementation rather than spreading
  through collaborating Interfaces.
- Tests verify the consistency invariant through the external seam with a
  concurrent activation and Citation-resolution write.
- Citation-resolution write consistency remains separate work.
- Legacy Source projection and presentation paths are removed rather than
  carried into the new module.
