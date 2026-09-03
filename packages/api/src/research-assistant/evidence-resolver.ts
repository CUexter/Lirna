import { randomUUID } from "node:crypto";

import {
  type AuthoredTargetInput,
  authoredTargetOffsetBasis,
} from "../authored-targets/authored-target";
import type { ReadingComponent } from "../sep-admission/reading/contract";

type EvidenceComponent = Pick<
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
  startOffset: number;
  endOffset: number;
}

const ignoredTerms = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "is",
  "of",
  "on",
  "that",
  "the",
  "this",
  "to",
  "what",
  "with",
]);

export function createEvidenceResolver(
  options: ResolverOptions,
): EvidenceResolver {
  const components = new Map(
    options.components.map((component) => [component.identity, component]),
  );
  const candidates = new Map<string, StoredCandidate>();
  let evidenceAliasSequence = 0;

  return {
    async find(input) {
      if (input.sourceStateId !== options.sourceStateId) return [];
      const intentTerms = lexicalTerms(input.intent);
      if (intentTerms.length === 0) return [];
      const ranked = input.componentIdentities
        .flatMap((identity) => {
          const component = components.get(identity);
          return component ? segments(component) : [];
        })
        .map((segment) => ({
          ...segment,
          score: lexicalScore(intentTerms, segment.passage),
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
  };
}

function segments(component: EvidenceComponent) {
  const matches = component.plainText.matchAll(/\S(?:.*?\S)?(?=\n\s*\n|$)/gs);
  const values = [...matches].flatMap((match) =>
    boundedSegments(match[0], match.index),
  );
  return values.map((value, index) => ({
    componentIdentity: component.identity,
    componentLabel: component.label,
    passage: value.passage,
    before: values[index - 1]?.passage.slice(-240) ?? "",
    after: values[index + 1]?.passage.slice(0, 240) ?? "",
    startOffset: value.startOffset,
    endOffset: value.endOffset,
  }));
}

function boundedSegments(text: string, baseOffset: number) {
  const values: Array<{
    passage: string;
    startOffset: number;
    endOffset: number;
  }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 20_000, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start) end = boundary;
    }
    values.push({
      passage: text.slice(start, end),
      startOffset: baseOffset + start,
      endOffset: baseOffset + end,
    });
    start = end;
    while (/\s/.test(text[start] ?? "")) start += 1;
  }
  return values;
}

function lexicalTerms(text: string) {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (term) => !ignoredTerms.has(term),
  );
}

function lexicalScore(intentTerms: string[], passage: string) {
  const passageTerms = new Set(lexicalTerms(passage));
  return new Set(intentTerms.filter((term) => passageTerms.has(term))).size;
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
