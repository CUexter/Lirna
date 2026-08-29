import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { inquiry } from "@/clients/inquiry";
import type { CitationResolution } from "../annotations/dom-utils";
import {
  type CitationEvidence,
  type CitationInference,
  useCitationResolutionActions,
} from "./citation-resolution-actions";
import {
  type CitationResolutionKey,
  type ConfirmedCitationResolutionConsequence,
  citationResolutionKey,
  projectCitationResolutionConsequences,
  sameCitationResolutionTarget,
} from "./citation-resolution-consequences";

export interface CitationResolutionWork {
  componentIdentity: string;
  mentionId: string;
  sequence: number;
  target: CitationResolutionTarget;
}

export interface CitationResolutionTarget {
  derivativeId: string;
  sourceId: string;
  stateId: string;
}

interface ResolutionFailure {
  kind: "reconciliation" | "write";
  message: string;
}

export function useCitationResolutionModule({
  active,
  citationResolutions,
  evidence,
  isCurrent,
  target,
}: {
  active?: CitationResolutionWork;
  citationResolutions: CitationResolution[];
  evidence?: CitationEvidence;
  isCurrent: (work: CitationResolutionWork) => boolean;
  target: CitationResolutionTarget;
}) {
  const queryClient = useQueryClient();
  const [consequences, setConsequences] = useState<
    ConfirmedCitationResolutionConsequence[]
  >([]);
  const [failures, setFailures] = useState<
    Record<string, ResolutionFailure | undefined>
  >({});
  const currentTarget = useRef(target);
  const consequenceSequences = useRef(new Map<CitationResolutionKey, number>());
  const priorTarget = useRef(target);
  currentTarget.current = target;

  useEffect(() => {
    if (sameCitationResolutionTarget(priorTarget.current, target)) return;
    priorTarget.current = target;
    consequenceSequences.current.clear();
    setConsequences([]);
    setFailures({});
  }, [target]);

  const clearFailure = (key: CitationResolutionKey) =>
    setFailures((state) => ({ ...state, [key]: undefined }));
  const clearWriteFailure = (key: CitationResolutionKey) =>
    setFailures((state) => ({
      ...state,
      [key]: state[key]?.kind === "write" ? undefined : state[key],
    }));
  const reportFailure = (
    key: CitationResolutionKey,
    error: Error,
    kind: ResolutionFailure["kind"] = "write",
  ) =>
    setFailures((state) => ({
      ...state,
      [key]: { kind, message: error.message },
    }));
  const reconcile = async (key: CitationResolutionKey, sequence: number) => {
    try {
      const projection = inquiry.sources.readingWorkspace.queryOptions({
        input: { sourceId: target.sourceId, stateId: target.stateId },
      });
      await queryClient.invalidateQueries(
        { exact: true, queryKey: projection.queryKey },
        { throwOnError: true },
      );
      if (consequenceSequences.current.get(key) === sequence) {
        consequenceSequences.current.delete(key);
        setConsequences((state) =>
          state.filter(
            (consequence) =>
              consequence.key !== key || consequence.sequence !== sequence,
          ),
        );
        clearFailure(key);
      }
    } catch (error) {
      if (
        sameCitationResolutionTarget(currentTarget.current, target) &&
        consequenceSequences.current.get(key) === sequence
      ) {
        reportFailure(key, error as Error, "reconciliation");
      }
    }
  };
  const publish = (
    work: CitationResolutionWork,
    sequence: number,
    resolution?: CitationResolution,
  ) => {
    if (!sameCitationResolutionTarget(currentTarget.current, work.target))
      return;
    const key = citationResolutionKey(work);
    consequenceSequences.current.set(key, sequence);
    setConsequences((state) => [
      ...state.filter((item) => item.key !== key),
      { key, resolution, sequence },
    ]);
    clearFailure(key);
    void reconcile(key, sequence);
  };
  const actions = useCitationResolutionActions({
    clearFailure,
    clearWriteFailure,
    isCurrent,
    publish,
    reportFailure,
    target,
  });
  const projectedResolutions = projectCitationResolutionConsequences(
    citationResolutions,
    consequences,
  );
  const activeKey = active ? citationResolutionKey(active) : undefined;
  const failure = activeKey ? failures[activeKey] : undefined;

  return {
    citationResolutions: projectedResolutions,
    resetWork: (work: CitationResolutionWork | undefined = active) => {
      if (!work) return;
      clearWriteFailure(citationResolutionKey(work));
      actions.resetWork(work);
    },
    panel:
      active && activeKey && evidence
        ? {
            availability: "ready" as const,
            current: currentResolution(projectedResolutions, active),
            evidence,
            failure: failure?.message,
            inference: actions.inferenceFor(activeKey),
            pending: actions.pendingFor(activeKey),
            onRetryReconciliation:
              failure?.kind === "reconciliation"
                ? () => retryReconciliation(activeKey)
                : undefined,
            onClear: () => actions.clear(active),
            onInfer: () => actions.infer(active),
            onSelect: (
              candidate: CitationEvidence["candidates"][number],
              inference?: Extract<CitationInference, { status: "suggested" }>,
            ) => actions.select(active, candidate, inference),
          }
        : undefined,
  };

  function retryReconciliation(key: CitationResolutionKey) {
    const sequence = consequenceSequences.current.get(key);
    if (sequence !== undefined) void reconcile(key, sequence);
  }
}

function currentResolution(
  resolutions: CitationResolution[],
  work: CitationResolutionWork,
) {
  return resolutions.find(
    (resolution) =>
      resolution.derivativeId === work.target.derivativeId &&
      resolution.componentIdentity === work.componentIdentity &&
      resolution.mentionId === work.mentionId,
  );
}
