# Deepen Reading workspace opening

## Status

Accepted

## Context

Opening a Reading workspace requires one policy across online and retained
observations. The route previously selected between those observations, decoded
their loading and error states, populated retained Annotations and reading
positions, migrated semantic positions into browser history, and decided when
the retained workspace was safe to render.

That knowledge formed one ordering invariant: a retained Reading workspace must
not become visible until its adjacent retained state is usable. Keeping the
protocol in the route made every route test and future caller responsible for
storage, query-cache, and browser-history details.

Scene transitions, authored writes, and server projection assembly protect
different invariants. They should not move behind the same seam merely because
the Reading workspace presents them together.

In particular, the server Reading workspace procedure still knows how admitted
state, the active Reading Derivative, Source metadata, legacy fallback, and
Citation resolutions form one projection. That caller knowledge requires a
separate server-side decision about projection consistency.

## Decision

Place Reading workspace opening behind one client module. Its interface accepts
a Source and Source-state identity and reports an opening, ready, or unavailable
result. A ready result identifies whether its workspace is online or retained.

The module owns these guarantees:

1. Online and retained reads begin independently for one target generation.
2. Online workspace data wins whenever it is available.
3. Retained data is eligible only after local record and integrity validation.
4. A retained workspace is not ready until its Annotations, reading positions,
   and semantic browser-history positions have been installed.
5. Failed retained hydration restores the prior query and browser-history state.
6. Completion for an obsolete Source state or retained replica cannot publish or
   hydrate into the current target.
7. Online recovery invalidates query projections installed from retained data
   before publishing the online workspace.
8. Online recovery preserves browser history because it represents the current
   reading session position, not an authoritative server projection.
9. Failure in one source cannot hide usable or still-pending data from the other.
10. Missing online data remains distinguishable from an unreachable server.

The route owns presentation and URL-backed navigation. Existing scene topology,
resolve-before-commit transitions, unsaved-Annotation guards, and owner-scoped
Reading navigation remain behind their established interfaces.

## Considered Options

### Keep orchestration in the route

Rejected. The route would continue to know the ordering and representation of
several infrastructure mechanisms, and tests would continue to reproduce that
composition.

### Encapsulate the complete route

Rejected for now. A route capsule would hide more URL and presentation policy,
but would couple Reading workspace opening to TanStack Router and prevent reuse
by another client surface.

### Use an observable workspace session

Rejected for now. Commands and lifecycle events are justified only when opening
and Offline working-set controls demonstrably need one shared session. Adding
that vocabulary before a second caller exists would be speculative generality.

## Consequences

- The route learns one opening interface rather than a storage and hydration
  protocol.
- Retained publication, rollback, stale-target suppression, and online recovery
  can be tested through one seam.
- Query-cache and browser-history details remain intentionally local to the web
  implementation.
- The module does not make server projection assembly transactional and does not
  coordinate authored writes with Reading Derivative activation.
