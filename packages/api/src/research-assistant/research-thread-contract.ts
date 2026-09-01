import type { AuthoredTargetInput } from "../authored-targets/authored-target";

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

export interface ResearchThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  selectedText?: string;
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
  get(input: {
    sourceId: string;
    stateId: string;
    threadId: string;
  }): Promise<ResearchThread | undefined>;
  append(input: {
    threadId: string;
    role: ResearchThreadMessage["role"];
    content: string;
    selectedText?: string;
    references?: ResearchPassageReference[];
  }): Promise<ResearchThreadMessage | undefined>;
}
