import type { AuthoredTargetInput } from "../authored-targets/authored-target";
import type { ResearchAssistantModel } from "./research-assistant-contract";

export type EvidenceRelation =
  | "supports"
  | "qualifies"
  | "conflicts"
  | "background";

export interface ResearchCitationOccurrence {
  answerTarget: {
    startOffset: number;
    endOffset: number;
  };
  id: string;
  presentation: "passing" | "quote";
  relation: EvidenceRelation;
  referenceId: string;
}

export interface ResearchPassageReference {
  id?: string;
  componentIdentity: string;
  componentLabel: string;
  occurrences?: ResearchCitationOccurrence[];
  selection: AuthoredTargetInput;
}

export interface AliasedResearchPassageReference
  extends ResearchPassageReference {
  evidenceAlias: string;
  id: string;
}

export const temporaryEvidenceMediaTypes = [
  "application/json",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;

export type TemporaryEvidenceMediaType =
  (typeof temporaryEvidenceMediaTypes)[number];

export interface TemporaryEvidenceDescriptor {
  filename: string;
  mediaType: TemporaryEvidenceMediaType;
}

export interface ResearchThreadMessage {
  id: string;
  originMessageId?: string;
  parentMessageId?: string;
  role: "user" | "assistant";
  content: string;
  model?: ResearchAssistantModel;
  regeneratedFromAnswerId?: string;
  answerAlternatives?: {
    position: number;
    total: number;
    previousAnswerId?: string;
    nextAnswerId?: string;
  };
  selectedText?: string;
  temporaryEvidence?: TemporaryEvidenceDescriptor[];
  references?: ResearchPassageReference[];
  createdAt: string;
}

export interface ResearchThreadSummary {
  id: string;
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  componentLabel: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchThread extends ResearchThreadSummary {
  messages: ResearchThreadMessage[];
}

export interface ResearchThreadOperations {
  create(input: {
    sourceId: string;
    stateId: string;
    componentIdentity: string;
    componentLabel: string;
    title: string;
  }): Promise<ResearchThread>;
  list(input: {
    sourceId: string;
    stateId: string;
  }): Promise<ResearchThreadSummary[]>;
  projectSelectedPath(input: {
    sourceId: string;
    stateId: string;
    threadId: string;
  }): Promise<ResearchThread | undefined>;
  appendQuestion(input: {
    threadId: string;
    content: string;
    selectedText?: string;
    temporaryEvidence?: TemporaryEvidenceDescriptor[];
  }): Promise<ResearchThreadMessage | undefined>;
  commitAnswer(input: {
    answerMessageId: string;
    threadId: string;
    questionMessageId: string;
    expectedSelectedLeafMessageId: string;
    content: string;
    model: ResearchAssistantModel;
    regeneratedFromAnswerId?: string;
    references?: ResearchPassageReference[];
  }): Promise<ResearchThreadMessage | undefined>;
  historyThroughQuestion(input: {
    threadId: string;
    questionMessageId: string;
  }): Promise<ResearchThreadMessage[] | undefined>;
  listChildren(input: {
    threadId: string;
    parentMessageId?: string;
  }): Promise<ResearchThreadMessage[]>;
  selectAnswerAlternative(input: {
    threadId: string;
    answerMessageId: string;
    expectedSelectedLeafMessageId: string;
  }): Promise<boolean>;
  createRelatedThread(input: {
    creationId: string;
    sourceId: string;
    stateId: string;
    sourceThreadId: string;
    sourceAnswerMessageId: string;
    title: string;
  }): Promise<
    | { status: "created" | "existing"; thread: ResearchThread }
    | { status: "conflict" }
    | { status: "source-answer-not-found" }
  >;
}
