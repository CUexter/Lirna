# Capture publication HTML and render typed derivatives

Lirna retains exact fetched publication resources as an immutable Source-state bundle and produces a replaceable typed reading Derivative for first-party rendering. It does not make converted Markdown authoritative or inject captured HTML into the Reading workspace: exact HTML preserves publication evidence, while a typed derivative safely represents sections, components, TeX, figures, Footnotes, and Bibliography entries without coupling the reading UI to publisher markup.

## Status

Accepted

## Decision

- Regeneration creates a new versioned candidate from the same immutable
  Source-state resources. Generation records parser and renderer versions plus
  every input resource hash; invalid candidates remain inspectable but cannot be
  activated.
- Activation appends an actor, reason, timestamp, and reviewed comparison. The
  latest activation selects the current valid Derivative; rollback uses the same
  operation to append a prior valid Derivative as current rather than rewriting
  history.
- Structural and diagnostic comparison plus authored-record relocation are
  activation consequences. Exact and context-relocated outcomes provide a
  target for the selected Derivative. Ambiguous and unresolved outcomes retain
  only their original Source-state evidence and require review; activation does
  not rewrite or delete the underlying Annotation, reading position, or Citation
  resolution.
- Activation recomputes consequences transactionally and rejects a stale review
  before appending history. Candidate generation is serialized per Source state
  so generation versions remain unique and ordered.

## Consequences

- Source-state resources and authored evidence remain authoritative and
  immutable across parser or renderer upgrades.
- Reading surfaces must present validation, comparison, relocation outcomes,
  current identity, and rollback consequences before explicit activation.
- Historical Derivatives admitted before versioned generation retain their
  original validation record; migrations do not claim that later checks ran.
