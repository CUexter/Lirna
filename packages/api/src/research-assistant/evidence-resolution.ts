import type {
  EvidenceAdmission,
  EvidenceCandidate,
  EvidenceComponent,
} from "./evidence-resolver";

export type { EvidenceComponent };

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
  | "close-ranked-passages"
  | "derivative-changed"
  | "session-expired"
  | "scope-denied"
  | "policy-denied"
  | "outside-session-scope"
  | "discovery-budget-exhausted"
  | "admission-budget-exhausted"
  | "evidence-character-budget-exhausted"
  | "model-step-budget-exhausted";

export type EvidenceDiscovery = {
  kind: "evidence-discovery";
  outcome: "candidates" | "ambiguous";
  componentScope: string[];
  candidateCount: number;
  candidates: EvidenceCandidate[];
  reasonCode?: "equally-ranked-passages" | "close-ranked-passages";
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
    | "admission-budget-exhausted"
    | "evidence-character-budget-exhausted"
    | "model-step-budget-exhausted";
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
  operation: "groundEvidence" | "admitEvidence";
  outcome: EvidenceResolutionOutcome;
  reasonCode?: EvidenceResolutionReasonCode;
  componentScope: string[];
  candidateCount?: number;
  durationMs: number;
}

export function ambiguousDiscovery(ranked: Array<{ relevanceScore: number }>): {
  outcome: "candidates" | "ambiguous";
  reasonCode?: "equally-ranked-passages" | "close-ranked-passages";
} {
  const top = ranked[0];
  const second = ranked[1];
  if (!top || !second) return { outcome: "candidates" };
  if (second.relevanceScore === top.relevanceScore)
    return { outcome: "ambiguous", reasonCode: "equally-ranked-passages" };
  if (closeRelevance(second.relevanceScore, top))
    return { outcome: "ambiguous", reasonCode: "close-ranked-passages" };
  return { outcome: "candidates" };
}

export function closeRelevance(
  score: number,
  top?: { relevanceScore: number },
) {
  return top !== undefined && score * 3 >= top.relevanceScore * 2;
}
