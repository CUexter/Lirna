import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { type LibraryOutputs, library } from "@/clients/library";
import type { CitationResolution } from "../annotations/dom-utils";
import {
  type CitationResolutionKey,
  citationResolutionKey,
  sameCitationResolutionTarget,
} from "./citation-resolution-consequences";
import type {
  CitationResolutionTarget,
  CitationResolutionWork,
} from "./citation-resolution-module";

export type CitationEvidence =
  LibraryOutputs["citationResolutions"]["evidence"][number];
export type CitationInference = LibraryOutputs["citationResolutions"]["infer"];
type DecisionKind = "clear" | "select";

export function useCitationResolutionActions({
  clearFailure,
  clearWriteFailure,
  isCurrent,
  publish,
  reportFailure,
  target,
}: {
  clearFailure: (key: CitationResolutionKey) => void;
  clearWriteFailure: (key: CitationResolutionKey) => void;
  isCurrent: (work: CitationResolutionWork) => boolean;
  publish: (
    work: CitationResolutionWork,
    sequence: number,
    resolution?: CitationResolution,
  ) => void;
  reportFailure: (key: CitationResolutionKey, error: Error) => void;
  target: CitationResolutionTarget;
}) {
  const [inferences, setInferences] = useState<
    Record<string, CitationInference | undefined>
  >({});
  const [pendingDecisions, setPendingDecisions] = useState<
    Record<string, DecisionKind | undefined>
  >({});
  const [pendingInferences, setPendingInferences] = useState<
    Record<string, boolean | undefined>
  >({});
  const currentTarget = useRef(target);
  const decisionTokens = useRef(new Map<CitationResolutionKey, number>());
  const inferenceTokens = useRef(new Map<CitationResolutionKey, number>());
  const nextSequence = useRef(0);
  const priorTarget = useRef(target);
  currentTarget.current = target;

  const inferResolution = useMutation(
    library.citationResolutions.infer.mutationOptions(),
  );
  const createResolution = useMutation(
    library.citationResolutions.create.mutationOptions(),
  );
  const clearResolution = useMutation(
    library.citationResolutions.clear.mutationOptions(),
  );

  useEffect(() => {
    if (sameCitationResolutionTarget(priorTarget.current, target)) return;
    priorTarget.current = target;
    decisionTokens.current.clear();
    inferenceTokens.current.clear();
    setInferences({});
    setPendingDecisions({});
    setPendingInferences({});
  }, [target]);

  const beginDecision = (work: CitationResolutionWork, kind: DecisionKind) => {
    const key = citationResolutionKey(work);
    if (decisionTokens.current.has(key)) return undefined;
    const token = ++nextSequence.current;
    decisionTokens.current.set(key, token);
    clearFailure(key);
    setPendingDecisions((state) => ({ ...state, [key]: kind }));
    return { key, token };
  };
  const finishDecision = (key: CitationResolutionKey, token: number) => {
    if (decisionTokens.current.get(key) !== token) return;
    decisionTokens.current.delete(key);
    setPendingDecisions((state) => ({ ...state, [key]: undefined }));
  };
  const reportDecisionFailure = (
    work: CitationResolutionWork,
    key: CitationResolutionKey,
    token: number,
    error: Error,
  ) => {
    if (
      sameCitationResolutionTarget(currentTarget.current, work.target) &&
      decisionTokens.current.get(key) === token
    ) {
      reportFailure(key, error);
    }
  };

  return {
    inferenceFor: (key: CitationResolutionKey) => inferences[key],
    pendingFor: (key: CitationResolutionKey) => ({
      clear: Boolean(pendingDecisions[key]),
      infer: Boolean(pendingInferences[key]),
      select: Boolean(pendingDecisions[key]),
    }),
    resetWork: (work: CitationResolutionWork) => {
      setInferences((state) => ({
        ...state,
        [citationResolutionKey(work)]: undefined,
      }));
    },
    clear: (work: CitationResolutionWork) => {
      if (!isCurrent(work)) return;
      const decision = beginDecision(work, "clear");
      if (!decision) return;
      void clearResolution
        .mutateAsync(decisionInput(work))
        .then(() => {
          if (isCurrent(work)) publish(work, decision.token);
        })
        .catch((error: Error) =>
          reportDecisionFailure(work, decision.key, decision.token, error),
        )
        .finally(() => finishDecision(decision.key, decision.token));
    },
    infer: (work: CitationResolutionWork) => {
      if (!isCurrent(work)) return;
      const key = citationResolutionKey(work);
      if (inferenceTokens.current.has(key)) return;
      const token = ++nextSequence.current;
      inferenceTokens.current.set(key, token);
      clearWriteFailure(key);
      setPendingInferences((state) => ({ ...state, [key]: true }));
      void inferResolution
        .mutateAsync({ ...decisionInput(work), consent: true })
        .then((result) => {
          if (inferenceIsCurrent(currentTarget.current, work, key, token)) {
            setInferences((state) => ({ ...state, [key]: result }));
          }
        })
        .catch((error: Error) => {
          if (inferenceIsCurrent(currentTarget.current, work, key, token)) {
            reportFailure(key, error);
          }
        })
        .finally(() => {
          if (inferenceTokens.current.get(key) !== token) return;
          inferenceTokens.current.delete(key);
          setPendingInferences((state) => ({ ...state, [key]: undefined }));
        });
    },
    select: (
      work: CitationResolutionWork,
      candidate: CitationEvidence["candidates"][number],
      selectedInference?: Extract<CitationInference, { status: "suggested" }>,
    ) => {
      if (!isCurrent(work)) return;
      const decision = beginDecision(work, "select");
      if (!decision) return;
      void createResolution
        .mutateAsync({
          ...decisionInput(work),
          bibliographyComponentIdentity:
            candidate.bibliographyComponentIdentity,
          bibliographyEntryId: candidate.bibliographyEntryId,
          method: selectedInference ? "inferred" : "manual",
          ...(selectedInference
            ? {
                confidence: selectedInference.confidence,
                reasoning: selectedInference.reasoning,
              }
            : {}),
        })
        .then((resolution) => {
          if (isCurrent(work) && resolutionBelongsToWork(resolution, work)) {
            publish(work, decision.token, resolution);
          }
        })
        .catch((error: Error) =>
          reportDecisionFailure(work, decision.key, decision.token, error),
        )
        .finally(() => finishDecision(decision.key, decision.token));
    },
  };

  function inferenceIsCurrent(
    current: CitationResolutionTarget,
    work: CitationResolutionWork,
    key: CitationResolutionKey,
    token: number,
  ) {
    return (
      inferenceTokens.current.get(key) === token &&
      sameCitationResolutionTarget(current, work.target)
    );
  }
}

function decisionInput(work: CitationResolutionWork) {
  return {
    sourceId: work.target.sourceId,
    stateId: work.target.stateId,
    expectedDerivativeId: work.target.derivativeId,
    componentIdentity: work.componentIdentity,
    mentionId: work.mentionId,
  };
}

function resolutionBelongsToWork(
  resolution: CitationResolution,
  work: CitationResolutionWork,
) {
  return (
    resolution.derivativeId === work.target.derivativeId &&
    resolution.componentIdentity === work.componentIdentity &&
    resolution.mentionId === work.mentionId
  );
}
