import { observeQuietly } from "../observation";

import type {
  EvidenceResolutionObservation,
  EvidenceResolutionResult,
  UnresolvedEvidenceOutcome,
  UnresolvedEvidenceReason,
  UnresolvedEvidenceResolution,
} from "./evidence-resolution";

export type { EvidenceComponent } from "./evidence-resolver";

import type { EvidenceComponent } from "./evidence-resolver";

export type SourceComponentReadResult =
  | {
      found: false;
      availableComponentIdentities: string[];
    }
  | {
      found: true;
      componentIdentity: string;
      componentLabel: string;
      offset: number;
      endOffset: number;
      nextOffset?: number;
      text: string;
    };

export function createSourceComponentReader(components: EvidenceComponent[]) {
  const byIdentity = new Map(
    components.map((component) => [component.identity, component]),
  );
  return async ({
    componentIdentity,
    offset,
  }: {
    componentIdentity: string;
    offset: number;
  }): Promise<SourceComponentReadResult> => {
    const component = byIdentity.get(componentIdentity);
    if (!component) {
      return {
        found: false,
        availableComponentIdentities: [...byIdentity.keys()],
      };
    }
    const endOffset = Math.min(offset + 100_000, component.plainText.length);
    return {
      found: true,
      componentIdentity,
      componentLabel: component.label,
      offset,
      endOffset,
      nextOffset:
        endOffset < component.plainText.length ? endOffset : undefined,
      text: component.plainText.slice(offset, endOffset),
    };
  };
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

export function observeEvidenceResolution<
  Result extends EvidenceResolutionResult,
>(
  result: Result,
  operation: EvidenceResolutionObservation["operation"],
  startedAt: number,
  observe?: (observation: EvidenceResolutionObservation) => void,
) {
  observeQuietly(() =>
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
    }),
  );
  return result;
}
