Recommendation
Build a deep ResearchEvidenceSession module that makes the model choose canonical evidence rather than reproduce it.
The core rule should be:
The model may describe what evidence it needs and select among candidates. Only Lirna may locate, canonicalize, validate, and persist evidence.
This removes exact-text copying from the trusted path entirely.
Current Problem
Today the model has too much responsibility:
1. Find relevant evidence.
2. Copy it exactly.
3. Identify repeated occurrences.
4. Supply enough information to construct an AuthoredTarget.
5. Recover when byte matching fails.
That logic is encoded in a shallow tool interface:
referencePassage({
  componentIdentity,
  exactText,
  occurrence,
});
Its apparent simplicity is misleading. The caller must understand normalization, punctuation, whitespace, component identity, repetition, and exact source wording.
Target Architecture
Research-thread question
        |
        v
ResearchEvidenceSession
        |
        +-- Evidence discovery
        |     Natural-language intent -> canonical candidates
        |
        +-- Evidence admission
        |     Candidate handle -> verified canonical passage
        |
        +-- Answer assembly
        |     Claims -> admitted evidence aliases
        |
        +-- Validation
        |     Scope, provenance, aliases, relations, budgets
        |
        +-- Commit
              Answer + canonical References atomically persisted
The router should not coordinate these stages. It should call one deep interface:
interface ResearchTurnOperations {
  answer(input: ResearchTurnInput): Promise<ReadableStream<UIMessageChunk>>;
}
Internally, the module owns the session, model tools, evidence handles, validation, persistence, telemetry, cancellation, and final commit.
Deleting this module would force all that complexity back into the router, model prompt, persistence stream, and UI. That is the deletion test showing the module earns its existence.
Session Model
A Research Evidence Session is a logical transaction, not a long-running database transaction.
interface ResearchEvidenceSession {
  readonly id: string;

  discover(intent: EvidenceIntent): Promise<EvidenceCandidateSet>;

  admit(input: AdmitEvidenceInput): Promise<EvidenceAdmission>;

  finalize(draft: AnswerDraft): Promise<ValidatedResearchAnswer>;
}
This three-operation internal interface is exposed only to the agent adapter. Application callers still use the single answer operation.
The session owns:
Responsibility	Session behavior
Source scope	Restricts discovery to the current immutable Source state
Policy	Enforces Source handling policy before model access
Handles	Issues opaque, turn-local candidate handles
Budgets	Limits searches, candidates, admissions, and model steps
Aliases	Assigns ev_1, ev_2, etc. only after admission
Validation	Rejects unknown, stale, ambiguous, or unadmitted evidence
Cancellation	Expires every uncommitted handle
Persistence	Commits only the final answer and canonical References
Observability	Emits content-free decision receipts
Evidence Discovery
Replace referencePassage with an intent-based tool:
findEvidence({
  intent: "Contemporary academic positions that reject trans women's identities",
  componentScope: ["active:/"],
  desiredRelation: "supports",
  limit: 5,
});
The result contains server-produced canonical passages:
{
  outcome: "candidates",
  candidates: [
    {
      handle: "candidate_7c912",
      componentLabel: "Main entry",
      passage:
        "Gender-critical feminism is typified by its rejection...",
      before: "Section 7 introduces...",
      after: "The details of these positions vary...",
    },
  ],
}
The model never supplies:
- Exact source text
- Character offsets
- Occurrence numbers
- Prefixes or suffixes
- Publisher anchors
- Persistent reference IDs
Those remain implementation details inside the module.
Canonical Index
Each active Reading Derivative should expose an internal evidence index. It can initially be built in memory and later persisted if performance requires it.
A segment should be larger than a sentence but smaller than an arbitrary 20,000-character quote:
interface EvidenceSegment {
  id: string;
  sourceStateId: string;
  derivativeId: string;
  componentIdentity: string;
  blockIdentity: string;
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
  lexicalTerms: string[];
}
Recommended segmentation:
- Preserve Source-component boundaries.
- Prefer publisher-authored paragraphs, list items, headings, and block quotes.
- Split oversized blocks by sentences while retaining structural ancestry.
- Allow candidate expansion to adjacent blocks.
- Never join passages across Source components.
- Derive every locator from the canonical Reading Derivative.
Recommended retrieval:
1. Structural scope filtering.
2. Lexical retrieval such as BM25/full-text search.
3. Optional embedding retrieval.
4. Reciprocal-rank fusion of lexical and semantic results.
5. Candidate expansion around matching segments.
6. Deduplication of substantially overlapping passages.
Embeddings improve discovery but never establish provenance. Canonical offsets and component identity establish provenance.
Opaque Handles
Discovery results receive random, turn-local handles:
type EvidenceCandidateHandle = string & {
  readonly __candidateHandle: unique symbol;
};
The server retains the corresponding candidate:
{
  handle: "candidate_7c912",
  sessionId: "session_...",
  sourceStateId: "...",
  derivativeId: "...",
  componentIdentity: "active:/",
  startOffset: 20683,
  endOffset: 21142,
  expiresAt: "...",
}
A handle must fail when:
- Used in another Research Evidence Session
- Used against another Source state
- Used after the session ends
- Its Reading Derivative is no longer active
- Its canonical text no longer validates
- Its Source handling policy no longer permits the operation
Cryptographic signing is unnecessary while handles remain server-side and turn-local. Random unguessable identifiers plus server state are simpler and safer.
Evidence Admission
The model selects a candidate:
admitEvidence({
  candidateHandle: "candidate_7c912",
  purpose: "Ground the claim that academic rejection remains present",
});
The module validates the candidate against the active Reading Derivative and returns:
{
  outcome: "admitted",
  evidenceAlias: "ev_1",
  passage: "Gender-critical feminism is typified...",
}
Only then does the module construct the canonical AuthoredTargetInput:
{
  offsetBasis: "normalized-derivative-text-v1",
  normalizedStartOffset: 20683,
  normalizedEndOffset: 21142,
  exactText: canonicalText,
  prefix: canonicalPrefix,
  suffix: canonicalSuffix,
}
The model cannot influence these fields.
Typed Outcomes
Do not encode semantic failures as successful tool outputs with a generic reason.
type EvidenceDiscovery =
  | {
      outcome: "candidates";
      candidates: EvidenceCandidate[];
    }
  | {
      outcome: "none";
      reason: "no-relevant-passage";
    }
  | {
      outcome: "ambiguous";
      candidates: EvidenceCandidate[];
      reason: "equally-ranked-passages";
    }
  | {
      outcome: "refused";
      reason: "scope-denied" | "policy-denied" | "budget-exhausted";
    };
Admission should likewise be explicit:
type EvidenceAdmission =
  | {
      outcome: "admitted";
      evidenceAlias: string;
      passage: string;
    }
  | {
      outcome: "stale";
      reason: "derivative-changed" | "session-expired";
    }
  | {
      outcome: "refused";
      reason: "ambiguous-target" | "outside-session-scope";
    };
The UI can then display meaningful states:
Outcome	UI
candidates	“Found 4 candidate passages”
none	“No relevant passage found”
ambiguous	“Several passages may apply”
admitted	“Verified passage”
stale	“Source representation changed”
refused	“Evidence could not be admitted”
Provider exception	“Tool failed”
This stops normal research uncertainty from appearing as infrastructure failure.
Answer Ledger
After evidence resolution is reliable, add proof-carrying answer assembly.
Before writing final prose, the model constructs a turn-local ledger:
interface AnswerClaim {
  key: string;
  text: string;
  kind: "source-dependent" | "interpretation" | "original-reasoning";
  evidence: Array<{
    alias: string;
    relation: "supports" | "qualifies" | "conflicts" | "background";
  }>;
}
Example:
{
  "claims": [
    {
      "key": "claim_1",
      "text": "The article presents gender-critical feminism as a current academic movement.",
      "kind": "source-dependent",
      "evidence": [
        {
          "alias": "ev_1",
          "relation": "supports"
        }
      ]
    },
    {
      "key": "claim_2",
      "text": "Its discussion of trans men is less extensive.",
      "kind": "interpretation",
      "evidence": [
        {
          "alias": "ev_2",
          "relation": "supports"
        },
        {
          "alias": "ev_3",
          "relation": "qualifies"
        }
      ]
    }
  ]
}
A deterministic validator can prove structural facts:
- Every alias was admitted during this session.
- Every admitted reference belongs to the permitted Source state.
- Every source-dependent claim has supporting or qualifying evidence.
- No background reference is presented as direct support.
- Citation markers in the final Markdown resolve.
- No unreferenced or invented aliases appear.
- Every persisted reference still validates against canonical text.
It cannot prove that evidence genuinely supports the claim. That remains a semantic judgment and should be presented honestly.
Finalization
The finalization phase should:
1. Validate the answer ledger.
2. Ask the model to synthesize concise Markdown from the validated ledger.
3. Compile evidence markers.
4. Revalidate every marker and character range.
5. Persist the answer and References in one short database transaction.
6. Expire all candidate handles.
7. Emit the final session receipt.
If validation fails, do not persist a partial assistant answer.
type FinalizationResult =
  | {
      outcome: "committed";
      message: ResearchThreadMessage;
    }
  | {
      outcome: "invalid-answer";
      problems: AnswerValidationProblem[];
    }
  | {
      outcome: "aborted";
      reason: "client-cancelled" | "provider-failed" | "budget-exhausted";
    };
Observability
Persist content-free decision receipts rather than raw tool traffic:
interface EvidenceDecisionReceipt {
  sessionId: string;
  researchThreadId: string;
  sourceStateId: string;
  componentScope: string[];
  resolverVersion: string;
  indexVersion: string;
  event:
    | "discovery-completed"
    | "admission-completed"
    | "admission-refused"
    | "answer-validation-failed"
    | "answer-committed";
  candidateCount?: number;
  outcome: string;
  reasonCode?: string;
  durationBucket: string;
}
Do not record candidate text, evidence intent, model reasoning, or article excerpts in operational observations.
This would have made the recent case diagnosable as:
12 admissions succeeded
7 discovery candidates were rejected
3 admissions were ambiguous
0 provider failures
0 stale Source-state failures
rather than a collection of unexplained “tool call failures.”
Budgets
Sessions need explicit limits:
interface ResearchEvidenceBudget {
  maximumDiscoveries: number;
  maximumCandidatesPerDiscovery: number;
  maximumAdmissions: number;
  maximumModelSteps: number;
  maximumTotalEvidenceCharacters: number;
}
When a budget is exhausted, the assistant should synthesize from admitted evidence and state what remains uncertain. It should not silently continue retrying.
Failure Safety
Failure	Required behavior
No candidate	Report missing evidence
Multiple close candidates	Return ambiguity, never choose the first silently
Derivative changes	Expire handles and restart discovery
Model invents a handle	Reject it
Model cites unadmitted evidence	Reject finalization
Provider disconnects	Persist no assistant answer
Client cancels	Expire handles and persist no partial answer
Persistence fails	Keep the Research thread without the assistant answer
Retrieval is semantically wrong	Permit rejection and another discovery
Source policy denies processing	Refuse before exposing candidate text
Migration
1. Introduce a pure EvidenceResolver module over current Reading components.
2. Add synthetic corpus tests for punctuation, repetition, ambiguity, and component scoping.
3. Add findEvidence and admitEvidence tools beside the current tool.
4. Measure admission success and refusal reasons without storing content.
5. Switch the model prompt to the new tools.
6. Delete referencePassage(exactText, occurrence).
7. Move answer/reference persistence behind the Research Evidence Session.
8. Add the claim ledger only after evidence resolution is stable.
9. Add hybrid semantic retrieval only if lexical retrieval demonstrably misses relevant passages.
Do not start with embeddings, signed handles, evidence graphs, or multiple verifier models. Those are attractive complexity traps.
First Slice
The first implementation should answer one narrow question:
Can the model identify and persist a canonical passage without ever supplying its text or offsets?
Build this interface:
interface EvidenceResolver {
  find(input: {
    sourceStateId: string;
    componentIdentities: string[];
    intent: string;
    limit: number;
  }): Promise<EvidenceCandidate[]>;

  admit(input: {
    sessionId: string;
    candidateHandle: string;
  }): Promise<EvidenceAdmission>;
}
Test these cases:
- Semantically relevant passage found despite different punctuation in the intent
- Repeated passage produces distinct candidates
- Candidate remains bound to the correct occurrence
- Candidate from another session is rejected
- Candidate from another Source state is rejected
- Replaced Reading Derivative makes the candidate stale
- Successful admission produces the exact canonical AuthoredTargetInput
- No-result and ambiguity outcomes are not rendered as tool crashes
Alternatives
Design	Assessment
★ Transactional Research Evidence Session	Best overall seam; centralizes lifecycle, validation, budgets, persistence, and cancellation
Intent → candidates → admission	Essential resolver mechanism; removes model transcription
Proof-carrying answer ledger	Valuable second phase; improves citation closure after resolution works
Tolerant exact-text matching	Useful temporary patch, not a long-term interface
Fixed numbered evidence tiles	Simple, but large articles expose too many irrelevant tiles
Server-extracted atomic claims	Risks canonizing fallible machine decomposition
Semantic evidence graph	High complexity without independently improving provenance
Signed evidence handles	Unnecessary unless handles cross trust domains
Multiple model verifiers	Expensive and often falsely independent
Automatic fuzzy anchoring	Dangerous because a unique fuzzy match can still be the wrong evidence
The non-obvious but viable move is not “better fuzzy matching.” It is making evidence admission a transactional capability owned by Lirna, with the model restricted to intent and selection.
