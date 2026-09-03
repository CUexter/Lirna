import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";

import type { ReadingComponent } from "../sep-admission/reading/contract";
import type {
  EvidenceResolutionObservation,
  EvidenceResolutionResult,
  UnresolvedEvidenceOutcome,
  UnresolvedEvidenceReason,
  UnresolvedEvidenceResolution,
} from "./evidence-resolution";
import { createEvidenceResolver } from "./evidence-resolver";

type EvidenceComponent = Pick<
  ReadingComponent,
  "identity" | "label" | "plainText" | "role"
>;

interface ResearchEvidenceToolOptions {
  components: EvidenceComponent[];
  sourceStateId: string;
  derivativeId: string;
  currentDerivativeId?: () => Promise<string | undefined>;
  observe?: (observation: EvidenceResolutionObservation) => void;
}

export function createResearchEvidenceSession(
  options: ResearchEvidenceToolOptions,
) {
  const sessionId = `session_${randomUUID()}`;
  const componentIdentities = new Set(
    options.components.map(({ identity }) => identity),
  );
  const resolver = createEvidenceResolver({
    sessionId,
    sourceStateId: options.sourceStateId,
    derivativeId: options.derivativeId,
    components: options.components,
    currentDerivativeId: options.currentDerivativeId,
  });
  let discoveries = 0;
  let admissions = 0;

  const tools = {
    readSourceComponent: sourceComponentReader(options.components),
    findEvidence: tool({
      description:
        "Find canonical passages matching a natural-language evidence intent within a bounded Source-component scope. Select a returned candidate by its opaque handle; never send quotation text or offsets.",
      inputSchema: z.object({
        intent: z.string().trim().min(1).max(2_000),
        componentScope: z.array(z.string().min(1)).min(1).max(20),
        desiredRelation: z
          .enum(["supports", "qualifies", "conflicts", "background"])
          .default("supports"),
        limit: z.number().int().min(1).max(5).default(5),
      }),
      execute: async ({ intent, componentScope, limit }) => {
        const startedAt = performance.now();
        discoveries += 1;
        if (discoveries > 12)
          return observed(
            unresolved(
              "budget-exhausted",
              "discovery-budget-exhausted",
              componentScope,
            ),
            "findEvidence",
            startedAt,
            options.observe,
          );
        if (
          componentScope.some((identity) => !componentIdentities.has(identity))
        )
          return observed(
            unresolved("refused", "scope-denied", componentScope),
            "findEvidence",
            startedAt,
            options.observe,
          );
        const rankedCandidates = await resolver.find({
          sourceStateId: options.sourceStateId,
          componentIdentities: componentScope,
          intent,
          limit: Math.max(2, limit),
        });
        if (rankedCandidates.length === 0)
          return observed(
            unresolved("none", "no-relevant-passage", componentScope, 0),
            "findEvidence",
            startedAt,
            options.observe,
          );
        const outcome =
          rankedCandidates.length > 1 &&
          rankedCandidates[0]?.relevanceScore ===
            rankedCandidates[1]?.relevanceScore
            ? "ambiguous"
            : "candidates";
        const candidates =
          outcome === "ambiguous"
            ? rankedCandidates.filter(
                ({ relevanceScore }) =>
                  relevanceScore === rankedCandidates[0]?.relevanceScore,
              )
            : rankedCandidates.slice(0, limit);
        return observed(
          {
            kind: "evidence-discovery",
            outcome,
            componentScope,
            candidateCount: candidates.length,
            candidates,
            ...(outcome === "ambiguous"
              ? { reasonCode: "equally-ranked-passages" as const }
              : {}),
          },
          "findEvidence",
          startedAt,
          options.observe,
        );
      },
    }),
    admitEvidence: tool({
      description:
        "Admit one candidate returned by findEvidence. A successful admission returns an answer-scoped evidence alias for Markdown markers.",
      inputSchema: z.object({
        candidateHandle: z.string().startsWith("candidate_").max(100),
        purpose: z.string().trim().min(1).max(1_000),
      }),
      execute: async ({ candidateHandle }) => {
        const startedAt = performance.now();
        admissions += 1;
        if (admissions > 12)
          return observed(
            unresolved("budget-exhausted", "admission-budget-exhausted", []),
            "admitEvidence",
            startedAt,
            options.observe,
          );
        const result = await resolver.admit({
          sessionId,
          sourceStateId: options.sourceStateId,
          candidateHandle,
        });
        return observed(result, "admitEvidence", startedAt, options.observe);
      },
    }),
  };
  return {
    tools,
    expire: () => resolver.expire(),
  };
}

function sourceComponentReader(components: EvidenceComponent[]) {
  const byIdentity = new Map(
    components.map((component) => [component.identity, component]),
  );
  return tool({
    description:
      "Read up to 100,000 characters of a Source component when broader context is needed before evidence discovery.",
    inputSchema: z.object({
      componentIdentity: z.string().min(1),
      offset: z.number().int().nonnegative().default(0),
    }),
    execute: async ({ componentIdentity, offset }) => {
      const component = byIdentity.get(componentIdentity);
      if (!component) {
        return {
          found: false as const,
          availableComponentIdentities: [...byIdentity.keys()],
        };
      }
      const endOffset = Math.min(offset + 100_000, component.plainText.length);
      return {
        found: true as const,
        componentIdentity,
        componentLabel: component.label,
        offset,
        endOffset,
        nextOffset:
          endOffset < component.plainText.length ? endOffset : undefined,
        text: component.plainText.slice(offset, endOffset),
      };
    },
  });
}

function unresolved<Outcome extends UnresolvedEvidenceOutcome>(
  outcome: Outcome,
  reasonCode: UnresolvedEvidenceReason<Outcome>,
  componentScope: string[],
  candidateCount?: number,
): Extract<UnresolvedEvidenceResolution, { outcome: Outcome }> {
  return {
    kind: "evidence-resolution",
    outcome,
    reasonCode,
    componentScope,
    ...(candidateCount === undefined ? {} : { candidateCount }),
  } as Extract<UnresolvedEvidenceResolution, { outcome: Outcome }>;
}

function observed<Result extends EvidenceResolutionResult>(
  result: Result,
  operation: EvidenceResolutionObservation["operation"],
  startedAt: number,
  observe?: (observation: EvidenceResolutionObservation) => void,
) {
  try {
    observe?.({
      operation,
      outcome: result.outcome,
      ...(result.outcome === "admitted" || result.outcome === "candidates"
        ? {}
        : { reasonCode: result.reasonCode }),
      componentScope:
        "componentScope" in result
          ? result.componentScope
          : [result.componentIdentity],
      candidateCount:
        "candidateCount" in result ? result.candidateCount : undefined,
      durationMs: performance.now() - startedAt,
    });
  } catch {
    // Diagnostics must not alter evidence resolution.
  }
  return result;
}
