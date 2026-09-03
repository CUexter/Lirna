import { randomUUID } from "node:crypto";

import {
  type AuthoredTargetInput,
  authoredTargetOffsetBasis,
} from "../authored-targets/authored-target";
import type { ReadingComponent } from "../sep-admission/reading/contract";
import {
  componentSegments,
  type EvidenceSegment,
  lexicalTerms,
} from "./evidence-index";

export type EvidenceComponent = Pick<
  ReadingComponent,
  "identity" | "label" | "plainText" | "role"
>;

export interface EvidenceCandidate {
  handle: string;
  componentIdentity: string;
  componentLabel: string;
  relevanceScore: number;
  passage: string;
  before: string;
  after: string;
}

export type EvidenceAdmission =
  | {
      kind: "source-passage-reference";
      outcome: "admitted";
      candidateCount: 1;
      id: string;
      evidenceAlias: string;
      componentIdentity: string;
      componentLabel: string;
      passage: string;
      selection: AuthoredTargetInput;
    }
  | {
      kind: "evidence-resolution";
      outcome: "stale";
      reasonCode: "derivative-changed" | "session-expired";
      componentScope: string[];
    }
  | {
      kind: "evidence-resolution";
      outcome: "refused";
      reasonCode: "outside-session-scope";
      componentScope: string[];
    };

export interface EvidenceResolver {
  find(input: {
    sourceStateId: string;
    componentIdentities: string[];
    intent: string;
    limit: number;
  }): Promise<EvidenceCandidate[]>;
  admit(input: {
    sessionId: string;
    sourceStateId: string;
    candidateHandle: string;
  }): Promise<EvidenceAdmission>;
  expire(): void;
}

interface ResolverOptions {
  sessionId: string;
  sourceStateId: string;
  derivativeId: string;
  components: EvidenceComponent[];
  currentDerivativeId?: () => Promise<string | undefined>;
}

interface StoredCandidate extends EvidenceCandidate {
  sourceStateId: string;
  derivativeId: string;
  blockIdentity: string;
  startOffset: number;
  endOffset: number;
}

export function createEvidenceResolver(
  options: ResolverOptions,
): EvidenceResolver {
  const components = new Map(
    options.components.map((component) => [component.identity, component]),
  );
  const candidates = new Map<string, StoredCandidate>();
  const segmentCache = new Map<string, EvidenceSegment[]>();
  let evidenceAliasSequence = 0;
  let expired = false;

  const segmentsFor = (identity: string): EvidenceSegment[] => {
    const cached = segmentCache.get(identity);
    if (cached) return cached;
    const component = components.get(identity);
    const built = component ? componentSegments(component) : [];
    segmentCache.set(identity, built);
    return built;
  };

  return {
    async find(input) {
      if (expired) return [];
      if (input.sourceStateId !== options.sourceStateId) return [];
      const intentTerms = lexicalTerms(input.intent);
      if (intentTerms.length === 0) return [];
      const intentTermSet = new Set(intentTerms);
      const ranked = input.componentIdentities
        .flatMap((identity) => segmentsFor(identity))
        .map((segment) => ({
          ...segment,
          score: lexicalScore(intentTermSet, new Set(segment.lexicalTerms)),
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || left.startOffset - right.startOffset,
        )
        .slice(0, Math.max(0, input.limit));

      return ranked.map(({ score, ...segment }) => {
        const handle = `candidate_${randomUUID()}`;
        const candidate = {
          ...segment,
          handle,
          relevanceScore: score,
          sourceStateId: options.sourceStateId,
          derivativeId: options.derivativeId,
        };
        candidates.set(handle, candidate);
        return publicCandidate(candidate);
      });
    },
    async admit(input) {
      const candidate = candidates.get(input.candidateHandle);
      if (expired) {
        return {
          kind: "evidence-resolution",
          outcome: "stale",
          reasonCode: "session-expired",
          componentScope: candidate ? [candidate.componentIdentity] : [],
        };
      }
      if (
        !candidate ||
        input.sessionId !== options.sessionId ||
        input.sourceStateId !== candidate.sourceStateId
      ) {
        return {
          kind: "evidence-resolution",
          outcome: "refused",
          reasonCode: "outside-session-scope",
          componentScope: [],
        };
      }
      candidates.delete(input.candidateHandle);
      const currentDerivativeId = await options.currentDerivativeId?.();
      if (expired) {
        return {
          kind: "evidence-resolution",
          outcome: "stale",
          reasonCode: "session-expired",
          componentScope: [candidate.componentIdentity],
        };
      }
      if (
        options.currentDerivativeId &&
        currentDerivativeId !== candidate.derivativeId
      ) {
        return {
          kind: "evidence-resolution",
          outcome: "stale",
          reasonCode: "derivative-changed",
          componentScope: [candidate.componentIdentity],
        };
      }
      const component = components.get(candidate.componentIdentity);
      if (
        !component ||
        component.plainText.slice(
          candidate.startOffset,
          candidate.endOffset,
        ) !== candidate.passage
      ) {
        return {
          kind: "evidence-resolution",
          outcome: "stale",
          reasonCode: "derivative-changed",
          componentScope: [candidate.componentIdentity],
        };
      }
      evidenceAliasSequence += 1;
      return {
        kind: "source-passage-reference",
        outcome: "admitted",
        candidateCount: 1,
        id: randomUUID(),
        evidenceAlias: `ev_${evidenceAliasSequence}`,
        componentIdentity: candidate.componentIdentity,
        componentLabel: candidate.componentLabel,
        passage: candidate.passage,
        selection: authoredTarget(component.plainText, candidate),
      };
    },
    expire() {
      expired = true;
    },
  };
}

function lexicalScore(
  intentTermSet: ReadonlySet<string>,
  passageTerms: ReadonlySet<string>,
) {
  let score = 0;
  for (const term of intentTermSet) if (passageTerms.has(term)) score += 1;
  return score;
}

function publicCandidate(candidate: StoredCandidate): EvidenceCandidate {
  return {
    handle: candidate.handle,
    componentIdentity: candidate.componentIdentity,
    componentLabel: candidate.componentLabel,
    relevanceScore: candidate.relevanceScore,
    passage: candidate.passage,
    before: candidate.before,
    after: candidate.after,
  };
}

function authoredTarget(
  plainText: string,
  candidate: Pick<StoredCandidate, "startOffset" | "endOffset" | "passage">,
): AuthoredTargetInput {
  return {
    offsetBasis: authoredTargetOffsetBasis,
    normalizedStartOffset: candidate.startOffset,
    normalizedEndOffset: candidate.endOffset,
    exactText: candidate.passage,
    prefix: plainText.slice(
      Math.max(0, candidate.startOffset - 32),
      candidate.startOffset,
    ),
    suffix: plainText.slice(candidate.endOffset, candidate.endOffset + 32),
  };
}
