import type {
  CitationInferenceOperations,
  CitationMentionEvidence,
  CitationResolutionOperations,
  CitationResolutionRecord,
} from "../../citation-resolutions/citation-resolution-contract";
import type { Context } from "../../context";
import { createTestContext } from "../application-test-support";

export const sourceId = "10000000-0000-4000-8000-000000000000";
export const stateId = "20000000-0000-4000-8000-000000000000";
const resolutionId = "30000000-0000-4000-8000-000000000000";
const derivativeId = "40000000-0000-4000-8000-000000000000";

export function mentionInput() {
  return {
    sourceId,
    stateId,
    componentIdentity: "article",
    mentionId: "citation-one",
  };
}

export function createInput() {
  return {
    ...mentionInput(),
    bibliographyComponentIdentity: "article",
    bibliographyEntryId: "entry-one",
    method: "manual" as const,
  };
}

export function record(
  input: Parameters<CitationResolutionOperations["create"]>[0],
): CitationResolutionRecord {
  return {
    id: resolutionId,
    sourceId: input.sourceId,
    sourceStateId: input.stateId,
    derivativeId,
    componentIdentity: input.componentIdentity,
    mentionId: input.mentionId,
    bibliographyComponentIdentity: input.bibliographyComponentIdentity,
    bibliographyEntryId: input.bibliographyEntryId,
    publisherAnchor: input.mentionId,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 4,
    normalizedEndOffset: 12,
    exactText: "evidence",
    prefix: "Read",
    suffix: " carefully.",
    actorId: input.actorId,
    method: input.method,
    confidence: input.confidence ?? null,
    reasoning: input.reasoning ?? null,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
}

export function mentionEvidence(
  overrides: Partial<CitationMentionEvidence> = {},
): CitationMentionEvidence {
  return {
    id: `${derivativeId}:article:citation-one`,
    sourceId,
    sourceStateId: stateId,
    derivativeId,
    componentIdentity: "article",
    mentionId: "citation-one",
    label: "Smith 2020",
    context: "See Smith 2020 for the claim.",
    state: "ambiguous",
    deterministicReason:
      "The authored surname and year matched more than one Bibliography entry.",
    candidates: [
      {
        id: "article:entry-one",
        bibliographyComponentIdentity: "article",
        bibliographyEntryId: "entry-one",
        label: "Smith (2020)",
        text: "Smith. 2020. Entry.",
        reason:
          "The authored surname and year matched more than one Bibliography entry.",
      },
    ],
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
      citationInference: {
        allowed: true,
        reason: "eligible",
        request: {
          activity: "citation-candidate-inference",
          endpointClass: "ordinary-cloud",
        },
      },
    },
    ...overrides,
  };
}

export function citationOperationsStub(
  overrides: Partial<CitationResolutionOperations> = {},
): CitationResolutionOperations {
  return {
    async list() {
      return [];
    },
    async history() {
      return [];
    },
    async evidence() {
      return [];
    },
    async create() {
      return undefined;
    },
    async clear() {
      return false;
    },
    ...overrides,
  };
}

export function context(
  citationResolutions: CitationResolutionOperations,
  options: {
    citationInference?: CitationInferenceOperations;
    fail?: (error: unknown) => void;
  } = {},
): Context {
  return createTestContext(
    {
      citationResolutions,
      ...(options.citationInference
        ? { citationInference: options.citationInference }
        : {}),
    },
    {
      observation: {
        requestId: "req-test",
        emit() {},
        fail: options.fail ?? (() => undefined),
      },
    },
  );
}
