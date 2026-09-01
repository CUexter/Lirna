# Let the research assistant place verified evidence in Markdown

## Status

Accepted

## Context

Research-thread answers need to distinguish an exact quotation from a passing
reference without forcing the model to construct the whole answer as a nested
object. The assistant already writes effective Markdown and can create
server-verified passage references, but those references currently belong to the
answer as a whole rather than to particular claims.

## Decision

The research assistant continues to write ordinary Markdown. A successful
passage-reference tool call also returns a short, answer-scoped evidence alias.
In its final answer, the model may place that evidence in one of two ways:

- `[^ev_3]` immediately after the smallest supported claim creates a passing
  reference.
- An empty `:::quote[ev_3]` block requests an exact quotation. Lirna inserts the
  verified passage text; the model does not reproduce it.

`supports` is the default Evidence relation. The model may use
`[^ev_3|qualifies]`, `[^ev_3|conflicts]`, or `[^ev_3|background]` when another
relation is material. The same relation suffix is available on quote blocks.
For example, `:::quote[ev_3|qualifies]` requests a qualifying quotation.

The aliases and marker text are placement instructions, not Citation identity.
At the server trust boundary, Lirna parses markers outside inline and fenced code,
rejects aliases that did not come from successful tool outputs, and compiles each
valid marker into a durable occurrence joining the answer location, verified
evidence target, and Evidence relation. Persisted occurrences receive application
identities; display numbers and prompt-facing aliases remain replaceable
renderings.

The renderer replaces passing markers with citation controls and quote directives
with the exact server-verified text plus a citation control. It retains the
complete Sources disclosure and plain answer text as fallbacks. Malformed or
unresolved markers never become trusted citations or quotations.

## Considered Options

- **A fully structured answer document** was rejected for the first implementation
  because it makes the model manage prose, layout, and evidence placement through
  a deeply nested schema and delays useful output until the object validates.
- **Model-generated numbered references and quotations** were rejected because
  numbers are presentation state and copied quotation text can drift from the
  verified Source-state evidence.
- **Answer-level references only** remain the fallback but cannot show which
  evidence grounds a particular claim.

## Consequences

- The model retains control of natural prose and chooses whether evidence deserves
  a quotation or a passing reference.
- Lirna, not the model, remains authoritative for exact quotation text, evidence
  identity, Source-state location, and navigation.
- The marker grammar and compiler require focused tests for malformed aliases,
  code blocks, interrupted streams, repeated evidence, and relation suffixes.
- A future structured editor can project the same durable occurrences into answer
  blocks without treating this prompt syntax as the storage model.
