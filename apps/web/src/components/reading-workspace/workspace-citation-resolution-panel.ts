import { useQuery } from "@tanstack/react-query";

import { library } from "@/clients/library";
import type { CitationResolution } from "../annotations/dom-utils";
import {
  type CitationResolutionTarget,
  type CitationResolutionWork,
  useCitationResolutionModule,
} from "./citation-resolution-module";
import type { CitationResolutionPanelProps } from "./citation-resolution-panel";

export function useWorkspaceCitationResolutionPanel({
  active,
  activeWorkSequence,
  cancel,
  citationResolutions,
  evidenceAccess,
  isCurrent,
  nextWorkSequence,
  setActive,
  target,
}: {
  active?: CitationResolutionWork;
  activeWorkSequence: React.RefObject<number | undefined>;
  cancel: (onCommit: () => void) => void;
  citationResolutions: CitationResolution[];
  evidenceAccess: "online" | "retained";
  isCurrent: (work: CitationResolutionWork) => boolean;
  nextWorkSequence: React.RefObject<number>;
  setActive: React.Dispatch<
    React.SetStateAction<CitationResolutionWork | undefined>
  >;
  target: CitationResolutionTarget;
}) {
  const options = library.citationResolutions.evidence.queryOptions({
    input: {
      expectedDerivativeId: target.derivativeId,
      sourceId: target.sourceId,
      stateId: target.stateId,
    },
  });
  const evidenceQuery = useQuery({
    ...options,
    enabled: evidenceAccess === "online",
  });
  const evidence = evidenceQuery.data?.find(
    (item) =>
      item.derivativeId === target.derivativeId &&
      item.componentIdentity === active?.componentIdentity &&
      item.mentionId === active.mentionId,
  );
  const evidenceIsCurrent =
    evidenceAccess === "online" &&
    !evidenceQuery.error &&
    !evidenceQuery.isFetching;
  const citationResolution = useCitationResolutionModule({
    active,
    citationResolutions,
    evidence: evidenceIsCurrent ? evidence : undefined,
    isCurrent,
    target,
  });
  const onCancel = active
    ? () =>
        cancel(() => {
          if (!isCurrent(active)) return;
          nextWorkSequence.current += 1;
          activeWorkSequence.current = undefined;
          setActive(undefined);
          citationResolution.resetWork();
        })
    : undefined;

  return {
    citationResolutions: citationResolution.citationResolutions,
    panel: resolutionPanel({
      active,
      evidenceAccess,
      evidenceError: evidenceQuery.error,
      evidencePending: evidenceQuery.isFetching,
      onCancel,
      retryEvidence: () => void evidenceQuery.refetch(),
      citationResolution,
    }),
    resetWork: citationResolution.resetWork,
  };
}

function resolutionPanel({
  active,
  evidenceAccess,
  evidenceError,
  evidencePending,
  onCancel,
  retryEvidence,
  citationResolution,
}: {
  active?: CitationResolutionWork;
  evidenceAccess: "online" | "retained";
  evidenceError: Error | null;
  evidencePending: boolean;
  onCancel?: () => void;
  retryEvidence: () => void;
  citationResolution: ReturnType<typeof useCitationResolutionModule>;
}): CitationResolutionPanelProps | undefined {
  if (!(active && onCancel)) return undefined;
  if (citationResolution.panel)
    return { ...citationResolution.panel, onCancel };
  if (evidenceAccess === "retained") {
    return {
      availability: "unavailable",
      mentionId: active.mentionId,
      message:
        "Current online evidence is unavailable while this Reading workspace is using its Offline working set. You can inspect the publication mention and return without changing its resolution.",
      onCancel,
    };
  }
  if (evidencePending) {
    return {
      availability: "pending",
      mentionId: active.mentionId,
      onCancel,
    };
  }
  return {
    availability: "unavailable",
    mentionId: active.mentionId,
    message:
      evidenceError?.message ??
      "Current online evidence is unavailable for this publication mention.",
    onCancel,
    onRetryEvidence: retryEvidence,
  };
}
