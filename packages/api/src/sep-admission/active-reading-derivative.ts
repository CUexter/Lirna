import type {
  DerivativeActivation,
  DerivativeComparison,
} from "../derivative-updates/derivative-update-contract";
import type { SourceHandlingPolicy } from "../source-handling-policy/source-handling-policy";
import type { SepReadingContract } from "./sep-reading-contract";

export interface ActiveReadingDerivative {
  sourceId: string;
  sourceTitle: string;
  stateId: string;
  derivativeId: string;
  activationId: string;
  activationSequence: number;
  reading: SepReadingContract;
  policy: SourceHandlingPolicy;
}

export class ActiveReadingDerivativeInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActiveReadingDerivativeInvariantError";
  }
}

export type ActiveReadingDerivativeReadResult =
  | { status: "active"; value: ActiveReadingDerivative }
  | { status: "source-state-not-found" }
  | { status: "no-active-derivative" };

export type ReadingDerivativeActivationPreviewResult =
  | {
      status: "ready";
      baselineSequence: number;
      consequences: DerivativeComparison;
    }
  | { status: "source-state-not-found" }
  | { status: "candidate-not-found" }
  | { status: "candidate-invalid" };

export type ReadingDerivativeActivationResult =
  | { status: "activated"; activation: DerivativeActivation }
  | { status: "source-state-not-found" }
  | { status: "candidate-not-found" }
  | { status: "candidate-invalid" }
  | { status: "stale-review" };

export interface ActiveReadingDerivativeOperations {
  read(input: {
    sourceId: string;
    stateId: string;
  }): Promise<ActiveReadingDerivativeReadResult>;
  previewActivation(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
  }): Promise<ReadingDerivativeActivationPreviewResult>;
  activate(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
    actorId: string;
    reason: string;
    expectedBaselineSequence: number;
    expectedConsequences: DerivativeComparison;
  }): Promise<ReadingDerivativeActivationResult>;
}
