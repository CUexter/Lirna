# Route Research turns through a Research Evidence Session

## Status

Accepted

## Context

The Research Assistant's tool interface once made the model responsible for the
whole evidence lifecycle: find relevant evidence, copy it exactly, identify
repeated occurrences, and recover when byte matching failed. Exact-text
transcription made normal research uncertainty look like infrastructure
failure, and a cancelled, failed, or partially persisted turn could leave a
Research thread inconsistent.

## Decision

Every Research Assistant turn runs behind one Research Evidence Session
(A [ADR 0014](0014-let-the-research-assistant-place-verified-evidence-in-markdown.md)
continues to govern how evidence is placed in the answer). The session is a
logical transaction, not a database transaction: model work happens outside any
database transaction, and durable writes happen only after the answer and its
verified References compile.

The session owns discovery, admission, claim-ledger validation, budgets,
cancellation, and the final answer-plus-References commit. The model may
describe the evidence it needs (`findEvidence` intent and component scope) and
select among candidates (`admitEvidence` by opaque, turn-local handle). Only
Lirna locates, canonicalizes, validates, and persists evidence, so the model
never supplies exact text, offsets, occurrence numbers, or target fields.
Claim-level Evidence relations live in the transient answer ledger prepared
before final synthesis; discovery-time relation requests were dropped as
speculative once the ledger owned relations.

Typed outcomes (`candidates`, `none`, `ambiguous`, `stale`, `refused`,
`budget-exhausted`, `admitted`) keep research uncertainty distinct from
infrastructure failure in the stream, the Research process, and observations.
A derivative change expires every remaining candidate handle and restarts
discovery against the new Reading Derivative. When final answer validation
fails at commit, the assistant receives one bounded repair step; a second
failure persists no answer and reports the invalid structure.

Cancellation before the atomic commit expires handles and persists nothing. A
cancel arriving during the short atomic commit is too late: the commit wins and
the receipt records the real terminal outcome, because aborting a persist
mid-transaction is worse than a committed-but-undelivered answer.

Each session emits a content-free decision receipt — session, thread, and
Source-state identity, resolver and index versions, budget consumption,
outcome, reason codes, candidate counts, and a latency bucket — persisted to
the `research_evidence_receipts` table and mirrored into Request/Operation
observations. Receipts never contain questions, intents, candidate passages,
or model reasoning.

The route crosses one `ResearchTurnOperations` interface. That thin adapter
earns its existence by the deletion test: deleting it would return partial
lifecycle coordination (thread persistence wiring, commit wiring) to the
router.

## Considered Options

- **Model-side exact-text transcription** (`referencePassage`) was rejected:
  the model had to understand normalization, repetition, and byte matching,
  and copied text could drift from canonical evidence.
- **Tolerant fuzzy matching of model text** was rejected: a unique fuzzy match
  can still be the wrong evidence.
- **Router-coordinated stages** were rejected because deletion of the session
  would force that complexity into the router, prompt, persistence stream, and
  UI.

## Consequences

- Expected research outcomes render as research statuses; only genuine
  execution failures appear as errors.
- Evidence receipts are durable and queryable while remaining content-free.
- Retired `referencePassage` compatibility is not retained in code, prompts, or
  tests; the retired protocol is documented as superseded in
  `docs/ai-elements-inline-citation-research.md`.
- Semantic retrieval, signed handles, and evidence graphs remain deferred until
  lexical retrieval demonstrably misses relevant passages.
