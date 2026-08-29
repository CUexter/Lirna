# Code quality standard

Every change must be correct for its stated behavior, preserve Lirna's domain
language, and leave the code no harder to understand. Passing an automated check
is necessary where one exists, but it is not evidence that a change is correct,
secure, accessible, or well designed.

Executable configuration, scripts, and workflows are authoritative for current
automation and thresholds. This document defines the standard those mechanisms
support.

## Correctness and tests

- Behavior must match the issue, acceptance criteria, or accepted decision.
- Tests must exercise behavior through the same public seam used by callers.
- A bug fix must include a regression test when a stable test seam exists.
- Important success, failure, authorization, and edge cases require evidence.
- Tests must be deterministic and independent of personal Vault content.
- Type, build, migration, and test failures block release when relevant.

## Readability and modules

- Names use the vocabulary defined by `CONTEXT.md`.
- Modules expose a small interface and hide substantial cohesive behavior.
- Control flow stays direct. Extract policy or domain behavior when the new seam
  creates leverage and locality, not solely to lower a metric.
- New duplication requires an explicit reason why shared implementation would
  create harmful coupling.
- Comments explain constraints or non-obvious reasoning rather than restating
  implementation.
- Code, tests, types, and executable configuration remain authoritative for
  current behavior.

See [Module standards](module-standards.md) for the review vocabulary.

## Architecture and domain integrity

- Workspace packages use their public exports and preserve allowed dependency
  directions.
- Browser code cannot import server-owned implementation, credentials, or
  privileged environment values.
- A new durable domain concept or lifecycle change updates `CONTEXT.md` or an
  ADR.
- Repository content never includes private Vault notes, journals, source
  documents, or other personal material.
- Persisted data, public interfaces, authentication behavior, and deployment
  contracts require explicit migration and compatibility reasoning.

## Security, privacy, and dependencies

- Validate untrusted input at trust seams and authorize protected operations on
  the server.
- Logs exclude secrets, credentials, private content, and unnecessary personal
  data.
- Database operations, process invocation, file paths, cryptography, and rendered
  content use safe mechanisms appropriate to their threat model.
- Apply Source handling policy and Sensitivity level before content leaves
  Nathan-controlled infrastructure.
- New dependencies require a concrete capability need, verified provenance and
  maintenance, an exact lockfile result, and comparison with existing options.
- Scanner suppressions stay narrow and explain why the relevant flow is safe.

## Frontend quality

- Interactive behavior supports keyboard input and exposes correct semantics,
  names, labels, focus behavior, and error feedback.
- Changed flows are checked at desktop and mobile widths.
- Loading, empty, error, offline, and retry states are considered when reachable.
- Performance-sensitive changes avoid network waterfalls, unbounded rendering,
  and avoidable bundle growth.

## Documentation

- Reference documentation explains public seams or operating steps that code
  cannot present directly.
- Decision documentation records durable rationale, alternatives, and
  consequences.
- Current implementation inventories belong in executable configuration or
  generated output, not manually maintained prose.
- Follow [ADR 0009](adr/0009-code-authority-and-documentation-roles.md).

## Human review

Mechanical checks prove only the rules they encode. Review remains responsible
for:

- behavioral completeness and regression strength;
- domain language and lifecycle consistency;
- module depth, cohesion, interface quality, and seam placement;
- authorization, privacy classification, data minimization, and threat modeling;
- accessibility, responsive behavior, visual quality, and complete UI states;
- runtime performance, query behavior, concurrency, and operational failure;
- compatibility, migration, rollback, and deployment safety;
- dependency necessity, trust, provenance, and licensing;
- documentation accuracy.

## Verification

Select verification proportional to the change. The normal local starting point
is:

```bash
bun run check-types
bun run quality
```

Run relevant builds, database tests, browser journeys, security scans, or Nix
checks when the change can affect those concerns. Use the aggregate local quality
command when broad application behavior changed:

```bash
bun run quality:ci
```

The change description states what ran, what was checked manually, and what could
not run. A green workflow never substitutes for review of concerns outside that
workflow's executable scope.
