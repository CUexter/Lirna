import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";

import {
  type AuthoredTargetInput,
  authoredTargetOffsetBasis,
} from "../authored-targets/authored-target";
import type { ReadingComponent } from "../sep-admission/reading/contract";
import type {
  EvidenceResolutionObservation,
  EvidenceResolutionResult,
  FoundEvidenceResolution,
  UnresolvedEvidenceResolution,
} from "./evidence-resolution";

type EvidenceComponent = Pick<
  ReadingComponent,
  "identity" | "label" | "plainText" | "role"
>;

type UnresolvedEvidenceResolutionInput =
  UnresolvedEvidenceResolution extends infer Resolution
    ? Resolution extends UnresolvedEvidenceResolution
      ? Omit<Resolution, "kind" | "componentScope">
      : never
    : never;

export function createResearchEvidenceTools(
  components: EvidenceComponent[],
  observe?: (observation: EvidenceResolutionObservation) => void,
) {
  const byIdentity = new Map(
    components.map((component) => [component.identity, component]),
  );
  let evidenceAliasSequence = 0;
  let referenceAttempts = 0;
  return {
    readSourceComponent: tool({
      description:
        "Read up to 100,000 characters of any component in this Source-state bundle, including supplementary articles and publisher notes. Most components fit in one call; continue from nextOffset only when necessary.",
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
        const endOffset = Math.min(
          offset + 100_000,
          component.plainText.length,
        );
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
    }),
    referencePassage: tool({
      description:
        "Create a verified navigable reference to an exact passage previously read from a Source component. Omit occurrence first; if the result is ambiguous, retry with the occurrence that grounds the claim.",
      inputSchema: z.object({
        componentIdentity: z.string().min(1),
        exactText: z.string().min(1).max(20_000),
        occurrence: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ componentIdentity, exactText, occurrence }) => {
        const startedAt = performance.now();
        referenceAttempts += 1;
        if (referenceAttempts > 12)
          return observed(
            unresolved(
              {
                outcome: "budget-exhausted",
                reasonCode: "admission-budget-exhausted",
              },
              componentIdentity,
            ),
            componentIdentity,
            startedAt,
            observe,
          );
        const component = byIdentity.get(componentIdentity);
        if (!component)
          return observed(
            unresolved(
              { outcome: "refused", reasonCode: "scope-denied" },
              componentIdentity,
            ),
            componentIdentity,
            startedAt,
            observe,
          );
        const matchingStarts = occurrenceStarts(component.plainText, exactText);
        if (matchingStarts.length === 0)
          return observed(
            unresolved(
              {
                outcome: "none",
                reasonCode: "no-matching-passage",
                candidateCount: 0,
              },
              componentIdentity,
            ),
            componentIdentity,
            startedAt,
            observe,
          );
        if (occurrence === undefined && matchingStarts.length > 1)
          return observed(
            unresolved(
              {
                outcome: "ambiguous",
                reasonCode: "multiple-matching-passages",
                candidateCount: matchingStarts.length,
              },
              componentIdentity,
            ),
            componentIdentity,
            startedAt,
            observe,
          );
        const start = matchingStarts[(occurrence ?? 1) - 1];
        if (start === undefined)
          return observed(
            unresolved(
              {
                outcome: "none",
                reasonCode: "no-matching-passage",
                candidateCount: 0,
              },
              componentIdentity,
            ),
            componentIdentity,
            startedAt,
            observe,
          );
        const selection: AuthoredTargetInput = {
          offsetBasis: authoredTargetOffsetBasis,
          normalizedStartOffset: start,
          normalizedEndOffset: start + exactText.length,
          exactText,
          prefix: component.plainText.slice(Math.max(0, start - 32), start),
          suffix: component.plainText.slice(
            start + exactText.length,
            start + exactText.length + 32,
          ),
        };
        evidenceAliasSequence += 1;
        return observed(
          {
            kind: "source-passage-reference",
            outcome: "found",
            candidateCount: 1,
            id: randomUUID(),
            evidenceAlias: `ev_${evidenceAliasSequence}`,
            componentIdentity,
            componentLabel: component.label,
            selection,
          } satisfies FoundEvidenceResolution,
          componentIdentity,
          startedAt,
          observe,
        );
      },
    }),
  };
}

function unresolved(
  result: UnresolvedEvidenceResolutionInput,
  componentIdentity: string,
): UnresolvedEvidenceResolution {
  const scope = {
    kind: "evidence-resolution" as const,
    componentScope: [componentIdentity],
  };
  switch (result.outcome) {
    case "none":
    case "ambiguous":
    case "stale":
    case "refused":
    case "budget-exhausted":
      return { ...scope, ...result };
  }
}

function observed<Result extends EvidenceResolutionResult>(
  result: Result,
  componentIdentity: string,
  startedAt: number,
  observe?: (observation: EvidenceResolutionObservation) => void,
) {
  try {
    observe?.({
      operation: "referencePassage",
      outcome: result.outcome,
      ...(result.outcome === "found" ? {} : { reasonCode: result.reasonCode }),
      componentScope: [componentIdentity],
      candidateCount:
        "candidateCount" in result ? result.candidateCount : undefined,
      durationMs: performance.now() - startedAt,
    });
  } catch {
    // Diagnostics must not alter evidence resolution.
  }
  return result;
}

function occurrenceStarts(text: string, exactText: string) {
  const starts: number[] = [];
  let start = -1;
  while (true) {
    start = text.indexOf(exactText, start + 1);
    if (start === -1) return starts;
    starts.push(start);
  }
}
