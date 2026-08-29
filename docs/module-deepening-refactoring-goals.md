# Module-deepening refactoring goals

Status: problem statement and direction for future design sessions.

## Purpose

Lirna's code is generally readable, typed, tested, and locally cohesive. The
refactoring concern is not ordinary code cleanliness. It is that system behavior
is increasingly distributed across many locally tidy files without being hidden
behind equally clear module interfaces.

This document records the current architectural problem and the desired
direction. It is not a module-by-module implementation plan. Later sessions
should deepen one candidate area at a time and record concrete interface
decisions only after examining that area's behavior and dependencies.

## Scope

The focus is the foundation of behavior already implemented:

- where module seams live;
- what callers must know;
- where invariants and transaction boundaries are owned;
- how implementation is divided without exposing its coordination;
- how tests exercise modules;
- which repository constraints encourage or obstruct module depth.

Missing early-stage features are not evidence of poor architecture merely
because they are absent. Authentication, workers, deployment automation, and
other planned capabilities should be evaluated when their product work begins.
They belong in this refactoring effort only when existing code falsely claims
their guarantees or makes their later introduction unnecessarily difficult.

## Current diagnosis

### Local readability exceeds system locality

Many files have good names, direct control flow, narrow responsibilities, and
focused tests. Those qualities make each file approachable. They do not by
themselves make the owning module deep.

In several behavior clusters, a maintainer must reconstruct a protocol spread
across state holders, operations, projections, stores, hooks, routers, fixtures,
and test harnesses. Ordering rules and consistency assumptions live in the
collaboration among files rather than behind one interface. Complexity has been
organized, but not hidden.

The resulting risk is subtle: another small, well-named file often looks like a
safe change even when it adds one more concept every caller and future agent must
understand.

### File size and module depth are in tension

Small files are valuable for reading, navigation, review, and focused editing.
They should remain the normal preference. A hard global line limit, however,
can force cohesive behavior apart before a natural seam exists.

The current standards prefer a cohesive deep module over pass-through files,
while the executable quality configuration rejects application files above a
fixed size. The desired policy must distinguish an ergonomic target from an
architectural failure:

- approximately 300 lines is a preferred review target;
- exceeding the target prompts a cohesion review rather than an automatic split;
- 500 non-blank lines is the hard limit protecting against genuinely
  unmanageable files;
- cohesive parsers, state machines, schemas, and transaction implementations
  may justify explicit exceptions;
- splitting solely to satisfy a metric is never a successful refactor.

The exception mechanism remains an implementation decision for a later session.

### Package boundaries do not guarantee behavioral depth

The workspace dependency direction is mostly clear and mechanically protected.
That prevents illegal imports and cycles, but a package can still expose a large
conceptual interface or make callers coordinate several internal capabilities.

In particular, application composition, transport handling, persistence,
projection, policy, and domain operations can all be legally placed while the
behavioral seam remains unclear. Package boundaries are useful structural
constraints; they are not substitutes for deep modules.

### Important invariants lack one owner

Observed correctness problems cluster where one operation spans several tidy
modules. Current examples include lifecycle deletion, Offline working-set
retention claims, Citation anchoring, authored writes during Derivative changes,
and workspace snapshot assembly.

These are not independent style problems. They are evidence that the relevant
invariants are known by several collaborators but owned by no single module.
The refactoring goal is to make invalid intermediate combinations
unrepresentable or unreachable through the module interface, not merely to add
checks to every caller.

### Tests sometimes reproduce the collaboration protocol

Lirna has strong tests, including realistic PostgreSQL invariant and concurrency
coverage. Some frontend and transport tests, however, need broad fixtures,
mutable action tables, or substitute implementations that recreate how several
production modules collaborate.

Such harnesses remain useful evidence, but their size is also architectural
feedback. When a test must rebuild a module's coordination to exercise one
behavior, the production seam is probably too shallow. The same small interface
should serve callers and most behavioral tests.

### Existing checks measure legality more than depth

The architecture, complexity, duplication, coverage, and dependency checks are
valuable. They establish narrow facts such as legal dependency direction,
bounded function complexity, low duplication, and exercised source files. None
can determine whether callers need too much knowledge or whether a seam owns a
complete invariant.

Passing the current quality suite therefore remains necessary evidence, but it
must not be interpreted as evidence that module depth is healthy.

## Refactoring goals

### 1. Make behavior deep behind deliberate interfaces

Each important behavior cluster should present a small interface that hides its
state transitions, ordering constraints, persistence coordination, policy
application, and error normalization. Callers should request a capability rather
than assemble it from mechanisms.

### 2. Preserve small implementation files without leaking coordination

A module may use several internal files for readability. Those files may divide
algorithms, persistence adapters, state transitions, and rendering concerns as
long as their collaboration remains implementation.

External callers should enter through the module interface instead of importing
the internal pieces in the correct combination. The target is small files inside
deep modules, not large files everywhere and not shallow files everywhere.

### 3. Give each invariant one clear owner

Lifecycle, consistency, policy, concurrency, and snapshot guarantees should each
have one module responsible for preserving them across the complete operation.
Routers and UI callers should not coordinate several stores or projections to
manufacture a valid domain result.

Transaction boundaries should follow the invariant being protected rather than
the current file or repository boundary.

### 4. Reduce the caller's knowledge burden

Refactoring should remove facts callers must know: operation ordering, query-key
coordination, fallback selection, active-revision checks, cross-store assembly,
and internal error distinctions.

Success is measured by knowledge removed from callers, not by helpers extracted,
files created, or lines moved.

### 5. Use the module interface as the primary test surface

Most behavioral tests should exercise the same interface used by production
callers. Internal tests remain appropriate for complex algorithms and adapters,
but test harnesses should not become a second application composition layer.

A deeper module should make important success, failure, and concurrency cases
easier to express with less setup.

### 6. Align executable constraints with the architecture

Repository checks should protect implementation encapsulation without pretending
to calculate module depth. Candidate constraints include designated module
entrypoints, restricted imports into implementation directories, function-level
complexity limits, dependency direction, and a file-size policy that permits
cohesion review.

Automation should nominate suspicious seams and prevent known violations. Human
review remains responsible for judging interface depth, invariant ownership, and
whether a split improves locality.

### 7. Preserve the strengths already present

Deepening must retain Lirna's domain vocabulary, runtime validation, PostgreSQL
invariants, deterministic capture bounds, explicit error behavior, and
concurrency testing. The goal is to concentrate these strengths behind better
interfaces, not replace them with a generic service architecture.

## Success criteria

A candidate refactor is successful when most of the following are true:

- callers cross one deliberate seam for the capability;
- callers import fewer concepts and perform less sequencing;
- internal implementation files can change without changing callers;
- one module owns the operation's invariants and transaction scope;
- invalid intermediate states are hidden from callers;
- expected errors are part of the interface rather than leaked adapter details;
- primary behavior tests use the same seam as production callers;
- test setup becomes smaller and no parallel coordination protocol is required;
- dependency direction remains explicit and acyclic;
- file readability remains good without metric-driven pass-through modules;
- the refactor deletes or absorbs obsolete interfaces rather than layering a new
  facade over all existing ones.

The deletion test remains decisive: if removing the proposed module would spread
its complexity back across callers, the module is earning its place. If removing
it would merely remove a forwarding layer, it is shallow.

## Approach for later sessions

Future work should deepen one behavior cluster at a time:

1. Map the capability, callers, invariants, ordering requirements, errors,
   persistence boundaries, and current tests.
2. Identify the knowledge that should disappear from callers.
3. Design more than one possible interface and compare depth, locality, and
   migration cost.
4. Choose the smallest tracer refactor that moves one complete invariant behind
   the selected seam.
5. Test through that seam and remove the superseded coordination path.
6. Reassess file organization only after the behavioral interface is stable.
7. Add an executable constraint only when the refactor reveals a repeatable,
   mechanically recognizable rule.

Likely candidate areas include Reading-workspace coordination, Source-state and
Offline lifecycle behavior, and application composition in the API package.
Their ordering and exact interfaces are intentionally undecided here.

## Guardrails

- Preserve behavior unless a separately identified bug is being fixed.
- Prefer replacing shallow interfaces to wrapping them indefinitely.
- Introduce adapters where behavior actually varies, not only to make tests mockable.
- Keep transport, framework, and database mechanics out of domain-facing interfaces
  when callers do not need those facts.
- Avoid repository-wide renaming or file movement without a demonstrated seam.
- Treat lower file count, higher file count, and LOC reduction as consequences,
  not objectives.

## Desired outcome

Lirna should remain easy to read one file at a time while becoming easier to
reason about one capability at a time. A maintainer or coding agent should be
able to enter through a small interface, understand the guarantees it provides,
and change its implementation without reconstructing a repository-wide protocol.

The destination is not fewer modules. It is fewer facts that escape each module.
