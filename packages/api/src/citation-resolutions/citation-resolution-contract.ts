import type { AuthoredTarget } from "../authored-targets/authored-target";
import type {
  CitationInferenceDecision,
  SourceHandlingPolicy,
} from "../source-handling-policy/source-handling-policy";

export const citationResolutionMethods = ["manual", "inferred"] as const;
export type CitationResolutionMethod =
  (typeof citationResolutionMethods)[number];
export const citationResolutionActions = ["selected", "cleared"] as const;
export type CitationResolutionAction =
  (typeof citationResolutionActions)[number];
export const citationEvidenceStates = ["ambiguous", "unresolved"] as const;
export type CitationEvidenceState = (typeof citationEvidenceStates)[number];

export class InvalidCitationResolutionError extends Error {
  constructor(message = "Citation mention or candidate is unavailable") {
    super(message);
    this.name = "InvalidCitationResolutionError";
  }
}

export interface CitationResolutionRecord extends AuthoredTarget {
  id: string;
  sourceId: string;
  sourceStateId: string;
  derivativeId: string;
  componentIdentity: string;
  mentionId: string;
  bibliographyComponentIdentity: string;
  bibliographyEntryId: string;
  actorId: string;
  method: CitationResolutionMethod;
  confidence: number | null;
  reasoning: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CitationResolutionDecision
  extends Omit<
    CitationResolutionRecord,
    "bibliographyComponentIdentity" | "bibliographyEntryId"
  > {
  action: CitationResolutionAction;
  bibliographyComponentIdentity: string | null;
  bibliographyEntryId: string | null;
}

export interface CitationMentionCandidate {
  id: string;
  bibliographyComponentIdentity: string;
  bibliographyEntryId: string;
  label: string;
  text: string;
  reason: string;
}

export interface CitationMentionEvidence {
  id: string;
  sourceId: string;
  sourceStateId: string;
  derivativeId: string;
  componentIdentity: string;
  mentionId: string;
  label: string;
  context: string;
  state: CitationEvidenceState;
  deterministicReason: string;
  candidates: CitationMentionCandidate[];
  policy: SourceHandlingPolicy & {
    citationInference: CitationInferenceDecision;
  };
}

export type CreateCitationResolutionInput = {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  mentionId: string;
  bibliographyComponentIdentity: string;
  bibliographyEntryId: string;
  actorId: string;
  method: CitationResolutionMethod;
  confidence?: number;
  reasoning?: string;
};

export function validateCitationResolutionMetadata(
  input: Pick<
    CreateCitationResolutionInput,
    "method" | "confidence" | "reasoning"
  >,
) {
  if (input.method === "manual") {
    if (input.confidence !== undefined || input.reasoning !== undefined) {
      throw new InvalidCitationResolutionError(
        "Manual decisions cannot include inference metadata",
      );
    }
    return;
  }
  if (
    input.confidence === undefined ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    !input.reasoning?.trim()
  ) {
    throw new InvalidCitationResolutionError(
      "Inferred decisions require confidence and reasoning",
    );
  }
}

export interface ClearCitationResolutionInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  mentionId: string;
  actorId: string;
}

export interface CitationInferenceInput {
  mention: { label: string; context: string };
  candidates: Array<{ id: string; label: string; text: string }>;
}

export interface CitationInferenceResult {
  candidateId: string | null;
  confidence: number;
  reasoning: string;
}

export interface CitationInferenceOperations {
  infer(input: CitationInferenceInput): Promise<CitationInferenceResult>;
}

export interface CitationResolutionOperations {
  list(sourceId: string, stateId: string): Promise<CitationResolutionRecord[]>;
  history(
    sourceId: string,
    stateId: string,
  ): Promise<CitationResolutionDecision[]>;
  evidence(
    sourceId: string,
    stateId: string,
  ): Promise<CitationMentionEvidence[] | undefined>;
  create(
    input: CreateCitationResolutionInput,
  ): Promise<CitationResolutionRecord | undefined>;
  clear(input: ClearCitationResolutionInput): Promise<boolean | undefined>;
}
