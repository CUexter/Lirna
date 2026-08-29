# Capture Offline working sets from one observation

## Status

Accepted

## Context

An Offline working-set snapshot combines a Reading workspace projection,
Annotations, Citation selections, and reading positions. Reading workspace
projection consistency alone cannot prevent the retained replica from mixing
authored and reading records committed at different times. Retention eligibility
also depends on the Source state's Source handling policy.

ADR 0011 intentionally left Annotation and reading-position assembly outside its
Reading workspace transaction. That boundary is insufficient for a retained
replica that claims to represent one server observation.

## Decision

Place server Offline working-set capture behind one operation. The operation
owns a read-only, repeatable-read transaction and reads the active Reading
Derivative and Source handling policy before collecting the complete Reading
workspace, Annotations, Citation selections, and reading positions from that
transaction's snapshot.

The Source handling policy refuses Offline working-set retention for
reference-only or inaccessible Source states. Sensitivity does not prevent
retention on a Client installation because retention is local rather than an
external-processing request.

Transport translates capture outcomes but does not coordinate persistence
reads. Online Reading workspace delivery remains behind its existing projection
operation, and authored writes keep their established transaction boundaries.

This decision supersedes ADR 0011 only where it says Offline working-set
assembly reads Annotations and positions separately.

## Consequences

- A retained replica represents one policy-eligible database observation.
- Snapshot-aware persistence reads remain implementation seams rather than
  additions to domain write interfaces.
- Concurrency tests cover authored records and Reading Derivative activation in
  the same capture invariant.
- Existing resource, Derivative, and readiness bounds remain part of snapshot
  construction after capture.
