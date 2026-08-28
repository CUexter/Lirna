import { useQuery } from "@tanstack/react-query";

import { library } from "@/clients/library";
import type { CitationResolution } from "../annotations/dom-utils";
import type { CitationResolutionPanelProps } from "./citation-resolution-panel";
import {
  type CitationResolutionTarget,
  type CitationResolutionWork,
  useCitationResolutionWrites,
} from "./citation-resolution-writes";

export function useWorkspaceCitationResolutionPanel({
  active,
  activeWorkId,
  cancel,
  current,
  evidenceAccess,
  isCurrent,
  nextWorkId,
  setActive,
  target,
}: {
  active?: CitationResolutionWork;
  activeWorkId: React.RefObject<number | undefined>;
  cancel: (onCommit: () => void) => void;
  current?: CitationResolution;
  evidenceAccess: "online" | "retained";
  isCurrent: (work: CitationResolutionWork) => boolean;
  nextWorkId: React.RefObject<number>;
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
  const writes = useCitationResolutionWrites({
    active,
    current,
    evidence: evidenceIsCurrent ? evidence : undefined,
    isCurrent,
    target,
  });
  const onCancel = active
    ? () =>
        cancel(() => {
          if (!isCurrent(active)) return;
          nextWorkId.current += 1;
          activeWorkId.current = undefined;
          setActive(undefined);
          writes.reset();
        })
    : undefined;

  return {
    panel: resolutionPanel({
      active,
      evidenceAccess,
      evidenceError: evidenceQuery.error,
      evidencePending: evidenceQuery.isFetching,
      onCancel,
      retryEvidence: () => void evidenceQuery.refetch(),
      writes,
    }),
    reset: writes.reset,
  };
}

function resolutionPanel({
  active,
  evidenceAccess,
  evidenceError,
  evidencePending,
  onCancel,
  retryEvidence,
  writes,
}: {
  active?: CitationResolutionWork;
  evidenceAccess: "online" | "retained";
  evidenceError: Error | null;
  evidencePending: boolean;
  onCancel?: () => void;
  retryEvidence: () => void;
  writes: ReturnType<typeof useCitationResolutionWrites>;
}): CitationResolutionPanelProps | undefined {
  if (!(active && onCancel)) return undefined;
  if (writes.panel) return { ...writes.panel, onCancel };
  if (evidenceAccess === "retained") {
    return {
      availability: "unavailable",
      mentionId: active.mentionId,
      message:
        "Current online evidence is unavailable in retained Reading. You can inspect the Citation and return without changing it.",
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
      "Current online evidence is unavailable for this Citation mention.",
    onCancel,
    onRetryEvidence: retryEvidence,
  };
}
