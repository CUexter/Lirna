# Code authority and documentation roles

## Status

Accepted

## Decision

Lirna maintains two roles for documentation:

- **Reference documentation** explains what the current system does and how to
  use or operate it. It reflects the code; it does not define behavior. Keep it
  only where a reader needs guidance across public seams, commands, or operating
  steps that the code cannot present directly. Prefer generated or mechanically
  checked facts, and update affected reference documentation in the same change
  as the code.
- **Decision documentation** records why a durable constraint or design choice
  exists, the alternatives considered, and the consequences. Accepted ADRs and
  domain rules constrain later implementation until explicitly superseded.
  Research may support a decision, but does not become binding merely by being
  stored under `docs/`.

Code is the authority for current implementation details. Names, types, module
interfaces, tests, executable configuration, and errors should make behavior
understandable without a parallel prose description. Comments explain a
non-obvious constraint or reason, not a sequence of operations already visible
in the code.

Documentation must not combine these roles in a way that makes durable rationale
depend on a manually maintained snapshot of current implementation. A decision
record may name the stable boundary it constrains, but should not copy symbol
inventories, command lists, defaults, or control flow from the implementation.
A reference document may link to the relevant decision instead of repeating its
rationale.

When reference prose would merely restate readable code, delete the prose. When
reference material is necessary but cannot be generated, tests and documentation
quality checks should verify its executable claims where practical. Review must
treat unverified implementation inventories and dated current-state reports as
staleness risks.

## Considered Options

- **Maintain comprehensive prose describing the implementation** - rejected
  because every implementation change creates a second manual update path and
  stale prose eventually competes with the code.
- **Keep only code and ADRs** - rejected because installation, operation, and
  cross-module workflows sometimes need a reader-oriented entry point that no
  single source file can provide.
- **Use comments as the primary explanation layer** - rejected because comments
  tied to mechanics drift with those mechanics and make self-explanatory code
  harder to distinguish from genuinely non-obvious constraints.

## Consequences

- Changes to current behavior update code, tests, and only the reference
  documentation needed by users or operators.
- Durable rationale and rejected alternatives remain discoverable after the
  implementation changes.
- Reviews should request clearer names, types, interfaces, or tests before
  requesting prose that repeats implementation.
- Existing mixed documents should be split or reduced when they next change;
  this decision does not require a churn-only repository-wide rewrite.
