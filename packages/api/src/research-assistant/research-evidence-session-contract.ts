import type { UIMessageChunk } from "ai";

import type {
  EvidenceResolutionObservation,
  EvidenceResolutionReasonCode,
  EvidenceResolutionResult,
} from "./evidence-resolution";
import type { PersistResearchAnswer } from "./research-answer-finalization";
import type { AnswerValidationProblem } from "./research-answer-ledger";
import type { EvidenceComponent } from "./research-evidence-tool-support";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

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
export const maximumAnswerLedgerAttempts = 2;

const researchToolNames = [
  "readSourceComponent",
  "findEvidence",
  "admitEvidence",
  "prepareAnswer",
] as const;

export type ResearchToolName = (typeof researchToolNames)[number];

export function isResearchToolName(name: string): name is ResearchToolName {
  return (researchToolNames as readonly string[]).includes(name);
}

export function validateResearchEvidenceBudget(
  budget: ResearchEvidenceBudget,
): ResearchEvidenceBudget {
  validateAmbiguityBudget(budget.maximumCandidatesPerDiscovery);
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

function validateAmbiguityBudget(maximumCandidatesPerDiscovery: number) {
  if (maximumCandidatesPerDiscovery < 2)
    throw new RangeError(
      "maximumCandidatesPerDiscovery must allow an ambiguous candidate pair",
    );
}

export function sessionReceipt(
  snapshot: ResearchEvidenceSessionSnapshot,
  commit: { researchThreadId: string },
  terminal: Pick<
    ResearchEvidenceDecisionReceipt,
    "outcome" | "terminalReasonCode" | "latencyBucket"
  >,
): ResearchEvidenceDecisionReceipt {
  return {
    sessionId: snapshot.sessionId,
    sourceStateId: snapshot.sourceStateId,
    resolverVersion: snapshot.resolverVersion,
    indexVersion: snapshot.indexVersion,
    budget: snapshot.budget,
    consumption: snapshot.consumption,
    candidateCount: snapshot.candidateCount,
    reasonCodes: snapshot.reasonCodes,
    admittedCount: snapshot.admittedCount,
    refusedCount: snapshot.refusedCount,
    budgetExhausted: snapshot.budgetExhausted,
    researchThreadId: commit.researchThreadId,
    ...terminal,
  };
}

export function completedOutcome(
  snapshot: ResearchEvidenceSessionSnapshot,
): ResearchEvidenceSessionOutcome {
  if (snapshot.budgetExhausted) return "exhausted";
  if (snapshot.refusedCount > 0 && snapshot.admittedCount === 0)
    return "refused";
  return "successful";
}

export function terminalReason(outcome: ResearchEvidenceSessionOutcome) {
  if (outcome === "cancelled")
    return { terminalReasonCode: "client-cancelled" as const };
  if (outcome === "provider-failed")
    return { terminalReasonCode: "provider-failed" as const };
  if (outcome === "invalid-answer")
    return { terminalReasonCode: "answer-validation-failed" as const };
  if (outcome === "commit-failed")
    return { terminalReasonCode: "commit-failed" as const };
  return {};
}

export function latencyBucket(
  durationMs: number,
): ResearchEvidenceDecisionReceipt["latencyBucket"] {
  if (durationMs < 100) return "under-100ms";
  if (durationMs < 1_000) return "100ms-1s";
  if (durationMs < 5_000) return "1s-5s";
  return "over-5s";
}

export interface ResearchEvidenceSessionOptions {
  components: EvidenceComponent[];
  sourceStateId: string;
  derivativeId: string;
  currentDerivativeId?: () => Promise<string | undefined>;
  observe?: (observation: EvidenceResolutionObservation) => void;
  update?: (snapshot: ResearchEvidenceSessionSnapshot) => void;
  budget?: ResearchEvidenceBudget;
  processingAllowed?: boolean;
}

export interface ResearchEvidenceSessionCompletion {
  commit?: {
    researchThreadId: string;
    persist: PersistResearchAnswer;
  };
  onError?: (error: unknown) => string;
  onReceipt?: (
    receipt: ResearchEvidenceDecisionReceipt,
  ) => void | Promise<void>;
  repair?: (
    problems: AnswerValidationProblem[],
  ) => Promise<ReadableStream<UIMessageChunk>>;
}

export interface ResearchEvidenceSession {
  readonly id: string;
  discover(input: {
    intent: string;
    componentScope: string[];
    limit: number;
  }): Promise<EvidenceResolutionResult>;
  admit(input: { candidateHandle: string }): Promise<EvidenceResolutionResult>;
  prepareAnswer(input: { claims: unknown[] }): Record<string, unknown>;
  snapshot(): ResearchEvidenceSessionSnapshot;
  hasValidAnswerLedger(): boolean;
  validAnswerLedger(): unknown;
  answerLedgerAttempts(): number;
  validateReferences(
    references: AliasedResearchPassageReference[],
  ): Promise<boolean>;
  run(
    start: () => Promise<ReadableStream<import("ai").UIMessageChunk>>,
    completion: ResearchEvidenceSessionCompletion,
  ): Promise<ReadableStream<import("ai").UIMessageChunk>>;
  beginModelStep(stepNumber: number): void;
  expire(): void;
}
