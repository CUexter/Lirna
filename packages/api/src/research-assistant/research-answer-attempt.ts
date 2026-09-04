import type { EvidenceResolutionResult } from "./evidence-resolution";
import type {
  AnswerLedger,
  AnswerValidationProblem,
  AnswerValidationResult,
} from "./research-answer-ledger";
import type { ResearchAssistantModel } from "./research-assistant-contract";
import type { ResearchEvidenceSessionSnapshot } from "./research-evidence-session-contract";
import type { SourceComponentReadResult } from "./research-evidence-tool-support";

export interface ResearchAnswerAttemptEvidence {
  readSourceComponent(input: {
    componentIdentity: string;
    offset: number;
  }): Promise<SourceComponentReadResult>;
  groundEvidence(input: {
    intent: string;
    componentScope: string[];
    limit: number;
  }): Promise<EvidenceResolutionResult>;
  admitEvidence(input: {
    candidateHandle: string;
  }): Promise<EvidenceResolutionResult>;
  prepareAnswer(input: {
    claims: AnswerLedger["claims"];
  }): ResearchAnswerPreparationResult;
  beginModelStep(stepNumber: number): void;
  snapshot(): ResearchEvidenceSessionSnapshot;
  hasValidAnswerLedger(): boolean;
  validAnswerLedger(): AnswerLedger | undefined;
  answerLedgerAttempts(): number;
}

export type ResearchAnswerPreparationResult = {
  kind: "answer-ledger";
} & AnswerValidationResult;

export interface ResearchAnswerAttemptInput {
  prompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  attachments: Array<{ data: URL; filename: string; mediaType: string }>;
  model: ResearchAssistantModel;
  maximumModelSteps: number;
  evidence: ResearchAnswerAttemptEvidence;
  onError?: (error: unknown) => string;
}

export interface ResearchAnswerRepairInput {
  prompt: string;
  model: ResearchAssistantModel;
  evidence: ResearchAnswerAttemptEvidence;
  problems: AnswerValidationProblem[];
  onError?: (error: unknown) => string;
}

export interface ResearchAnswerAttemptOperations<Chunk> {
  start(input: ResearchAnswerAttemptInput): Promise<ReadableStream<Chunk>>;
  repair(input: ResearchAnswerRepairInput): Promise<ReadableStream<Chunk>>;
}
