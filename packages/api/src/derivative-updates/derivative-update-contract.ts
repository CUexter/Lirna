import type { SepReadingContract } from "../sep-admission/sep-reading-contract";

export type RelocationClassification =
  | "exact"
  | "context-relocated"
  | "ambiguous"
  | "unresolved";

export interface RelocationOutcome {
  recordType: "annotation" | "reading-position" | "citation-resolution";
  recordId: string;
  classification: RelocationClassification;
  original: { componentIdentity: string; derivativeId?: string };
  target?: {
    componentIdentity: string;
    normalizedStartOffset?: number;
    normalizedEndOffset?: number;
  };
  candidates: number;
  reason: string;
}

export interface DerivativeValidation {
  status: "valid" | "invalid";
  checks: Array<{
    subject:
      | "typed-structure"
      | "internal-targets"
      | "component-resources"
      | "notation"
      | "figures"
      | "footnotes"
      | "bibliography"
      | "diagnostics";
    status: "passed" | "failed";
    messages: string[];
  }>;
}

export interface DerivativeComparison {
  baselineDerivativeId?: string;
  semantic: {
    changedComponents: Array<{
      identity: string;
      beforeTextSha256?: string;
      afterTextSha256?: string;
    }>;
  };
  structure: Array<{
    subject: "components" | "sections" | "figures" | "bibliography";
    before: number;
    after: number;
    beforeSha256?: string;
    afterSha256: string;
  }>;
  diagnostics: { added: string[]; removed: string[] };
  relocations: RelocationOutcome[];
}

export interface ReadingDerivativeCandidate {
  id: string;
  sourceStateId: string;
  kind: "sep-reading-v1";
  previousDerivativeId?: string;
  valid: boolean;
  generation: {
    version: number;
    parser: { id: string; version: string };
    renderer: { id: string; version: string };
    inputResourceHashes: Array<{ identity: string; sha256: string }>;
  };
  validation: DerivativeValidation;
  comparison: DerivativeComparison;
  reading?: SepReadingContract;
  createdAt: string;
  currentActivation?: DerivativeActivation;
}

export interface DerivativeActivation {
  id: string;
  derivativeId: string;
  actorId: string;
  reason: string;
  activatedAt: string;
  consequences: DerivativeComparison;
}

export interface DerivativeUpdateOperations {
  generate(input: {
    sourceId: string;
    stateId: string;
  }): Promise<ReadingDerivativeCandidate | undefined>;
  previewActivation(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
  }): Promise<DerivativeComparison | undefined>;
  activate(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
    actorId: string;
    reason: string;
    expectedConsequences: DerivativeComparison;
  }): Promise<DerivativeActivation | undefined>;
}
