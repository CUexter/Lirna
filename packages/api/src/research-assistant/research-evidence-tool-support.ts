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

type EvidenceComponent = Pick<
  ReadingComponent,
  "identity" | "label" | "plainText" | "role"
>;

export function sourceComponentReader(components: EvidenceComponent[]) {
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

export function unresolved<Outcome extends UnresolvedEvidenceOutcome>(
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

export function observed<Result extends EvidenceResolutionResult>(
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
