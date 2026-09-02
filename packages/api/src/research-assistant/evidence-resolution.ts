export type EvidenceResolutionOutcome =
  | "found"
  | "none"
  | "ambiguous"
  | "stale"
  | "refused"
  | "budget-exhausted";

export type EvidenceResolutionReasonCode =
  | "no-matching-passage"
  | "multiple-matching-passages"
  | "derivative-changed"
  | "session-expired"
  | "scope-denied"
  | "policy-denied"
  | "admission-budget-exhausted";

export type FoundEvidenceResolution =
  import("./research-thread-contract").AliasedResearchPassageReference & {
    kind: "source-passage-reference";
    outcome: "found";
    candidateCount: 1;
  };

interface UnresolvedEvidenceResolutionBase {
  kind: "evidence-resolution";
  componentScope: string[];
}

export type UnresolvedEvidenceResolution =
  | (UnresolvedEvidenceResolutionBase & {
      outcome: "none";
      reasonCode: "no-matching-passage";
      candidateCount: 0;
    })
  | (UnresolvedEvidenceResolutionBase & {
      outcome: "ambiguous";
      reasonCode: "multiple-matching-passages";
      candidateCount: number;
    })
  | (UnresolvedEvidenceResolutionBase & {
      outcome: "stale";
      reasonCode: "derivative-changed" | "session-expired";
    })
  | (UnresolvedEvidenceResolutionBase & {
      outcome: "refused";
      reasonCode: "scope-denied" | "policy-denied";
    })
  | (UnresolvedEvidenceResolutionBase & {
      outcome: "budget-exhausted";
      reasonCode: "admission-budget-exhausted";
    });

export type EvidenceResolutionResult =
  | FoundEvidenceResolution
  | UnresolvedEvidenceResolution;

export interface EvidenceResolutionObservation {
  operation: "referencePassage" | "findEvidence" | "admitEvidence";
  outcome: EvidenceResolutionOutcome;
  reasonCode?: EvidenceResolutionReasonCode;
  componentScope: string[];
  candidateCount?: number;
  durationMs: number;
}
