export type CitationResolutionMethod = "manual" | "inferred";

export interface CitationResolutionRecord {
  id: string;
  sourceId: string;
  sourceStateId: string;
  derivativeId: string;
  componentIdentity: string;
  mentionId: string;
  bibliographyComponentIdentity: string;
  bibliographyEntryId: string;
  publisherAnchor: string | null;
  offsetBasis: "normalized-derivative-text-v1";
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
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
  action: "selected" | "cleared";
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
  state: "ambiguous" | "unresolved";
  deterministicReason: string;
  candidates: CitationMentionCandidate[];
  policy: {
    rightsBasis: string;
    sensitivityLevel: string;
    inferenceEligible: boolean;
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
