import type { EvidenceAdmission, EvidenceCandidate } from "./evidence-resolver";

export type EvidenceResolutionOutcome =
  | "candidates"
  | "admitted"
  | "none"
  | "ambiguous"
  | "stale"
  | "refused"
  | "budget-exhausted";

export type EvidenceResolutionReasonCode =
  | "no-relevant-passage"
  | "equally-ranked-passages"
  | "derivative-changed"
  | "session-expired"
  | "scope-denied"
  | "policy-denied"
  | "outside-session-scope"
  | "discovery-budget-exhausted"
  | "admission-budget-exhausted";

export type EvidenceDiscovery = {
  kind: "evidence-discovery";
  outcome: "candidates" | "ambiguous";
  componentScope: string[];
  candidateCount: number;
  candidates: EvidenceCandidate[];
  reasonCode?: "equally-ranked-passages";
};

interface UnresolvedEvidenceResolutionFields {
  kind: "evidence-resolution";
  componentScope: string[];
  candidateCount?: number;
}

interface UnresolvedEvidenceReasons {
  none: "no-relevant-passage";
  stale: "derivative-changed" | "session-expired";
  refused: "scope-denied" | "policy-denied" | "outside-session-scope";
  "budget-exhausted":
    | "discovery-budget-exhausted"
    | "admission-budget-exhausted";
}

export type UnresolvedEvidenceResolution = {
  [Outcome in keyof UnresolvedEvidenceReasons]: UnresolvedEvidenceResolutionFields & {
    outcome: Outcome;
    reasonCode: UnresolvedEvidenceReasons[Outcome];
  };
}[keyof UnresolvedEvidenceReasons];

export type UnresolvedEvidenceOutcome = keyof UnresolvedEvidenceReasons;
export type UnresolvedEvidenceReason<
  Outcome extends UnresolvedEvidenceOutcome,
> = UnresolvedEvidenceReasons[Outcome];

export type EvidenceResolutionResult =
  | EvidenceDiscovery
  | EvidenceAdmission
  | UnresolvedEvidenceResolution;

export interface EvidenceResolutionObservation {
  operation: "findEvidence" | "admitEvidence";
  outcome: EvidenceResolutionOutcome;
  reasonCode?: EvidenceResolutionReasonCode;
  componentScope: string[];
  candidateCount?: number;
  durationMs: number;
}
