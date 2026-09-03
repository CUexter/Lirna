import type { EvidenceResolutionReasonCode } from "./evidence-resolution";

export interface ResearchEvidenceBudget {
  maximumDiscoveries: number;
  maximumCandidatesPerDiscovery: number;
  maximumAdmissions: number;
  maximumModelSteps: number;
  maximumTotalEvidenceCharacters: number;
}

export interface ResearchEvidenceConsumption {
  discoveries: number;
  candidates: number;
  admissions: number;
  modelSteps: number;
  evidenceCharacters: number;
}

export interface ResearchEvidenceSessionSnapshot {
  sessionId: string;
  sourceStateId: string;
  resolverVersion: string;
  indexVersion: string;
  budget: ResearchEvidenceBudget;
  consumption: ResearchEvidenceConsumption;
  componentScope: string[];
  candidateCount: number;
  reasonCodes: EvidenceResolutionReasonCode[];
  admittedCount: number;
  refusedCount: number;
  budgetExhausted: boolean;
}

export type ResearchEvidenceSessionOutcome =
  | "successful"
  | "refused"
  | "exhausted"
  | "invalid-answer"
  | "cancelled"
  | "provider-failed"
  | "commit-failed";

export interface ResearchEvidenceDecisionReceipt
  extends Pick<
    ResearchEvidenceSessionSnapshot,
    | "sessionId"
    | "sourceStateId"
    | "resolverVersion"
    | "indexVersion"
    | "budget"
    | "consumption"
    | "candidateCount"
    | "reasonCodes"
    | "admittedCount"
    | "refusedCount"
    | "budgetExhausted"
  > {
  researchThreadId: string;
  outcome: ResearchEvidenceSessionOutcome;
  terminalReasonCode?:
    | "client-cancelled"
    | "provider-failed"
    | "answer-validation-failed"
    | "commit-failed";
  latencyBucket: "under-100ms" | "100ms-1s" | "1s-5s" | "over-5s";
}

export const defaultResearchEvidenceBudget: ResearchEvidenceBudget = {
  maximumDiscoveries: 12,
  maximumCandidatesPerDiscovery: 5,
  maximumAdmissions: 12,
  maximumModelSteps: 8,
  maximumTotalEvidenceCharacters: 100_000,
};

export const researchEvidenceResolverVersion = "lexical-v1";
export const researchEvidenceIndexVersion = "reading-components-v1";

export function validateResearchEvidenceBudget(
  budget: ResearchEvidenceBudget,
): ResearchEvidenceBudget {
  for (const [name, value] of Object.entries(budget)) {
    if (name === "maximumModelSteps" && value < 3)
      throw new RangeError(
        "maximumModelSteps must reserve ledger preparation, repair, and synthesis",
      );
    const allowsZero =
      name === "maximumDiscoveries" ||
      name === "maximumAdmissions" ||
      name === "maximumTotalEvidenceCharacters";
    if (!Number.isSafeInteger(value) || value < (allowsZero ? 0 : 1))
      throw new RangeError(
        `${name} must be a ${allowsZero ? "non-negative" : "positive"} integer`,
      );
  }
  return budget;
}
