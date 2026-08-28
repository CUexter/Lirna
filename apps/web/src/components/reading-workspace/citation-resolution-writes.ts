import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { type LibraryOutputs, library } from "@/clients/library";
import type { CitationResolution } from "../annotations/dom-utils";
import type { ReadingWorkspaceModel } from "./workspace-types";

type Evidence = LibraryOutputs["citationResolutions"]["evidence"][number];
type Inference = LibraryOutputs["citationResolutions"]["infer"];

export interface CitationResolutionWork {
  componentIdentity: string;
  id: number;
  mentionId: string;
  target: CitationResolutionTarget;
}

export interface CitationResolutionTarget {
  derivativeId: string;
  sourceId: string;
  stateId: string;
}

export function useCitationResolutionWrites({
  active,
  current,
  evidence,
  isCurrent,
  target,
}: {
  active?: CitationResolutionWork;
  current?: CitationResolution;
  evidence?: Evidence;
  isCurrent: (work: CitationResolutionWork) => boolean;
  target: CitationResolutionTarget;
}) {
  const queryClient = useQueryClient();
  const workspaceKey = library.sources.readingWorkspace.key({
    input: { sourceId: target.sourceId, stateId: target.stateId },
  });
  const [inference, setInference] = useState<Inference>();
  const inferResolution = useMutation(
    library.citationResolutions.infer.mutationOptions(),
  );
  const createResolution = useMutation(
    library.citationResolutions.create.mutationOptions(),
  );
  const clearResolution = useMutation(
    library.citationResolutions.clear.mutationOptions(),
  );
  const inferWorkId = useRef<number | undefined>(undefined);
  const createWorkId = useRef<number | undefined>(undefined);
  const clearWorkId = useRef<number | undefined>(undefined);

  const reset = () => {
    setInference(undefined);
    inferResolution.reset();
    createResolution.reset();
    clearResolution.reset();
  };
  const invalidateWorkspace = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKey });
  const updateResolution = (
    work: CitationResolutionWork,
    resolution: CitationResolution | undefined,
  ) => {
    if (
      !resolution ||
      !isCurrent(work) ||
      resolution.derivativeId !== target.derivativeId ||
      resolution.componentIdentity !== work.componentIdentity ||
      resolution.mentionId !== work.mentionId
    )
      return;
    queryClient.setQueryData<ReadingWorkspaceModel>(workspaceKey, (workspace) =>
      projectResolution(workspace, work, resolution),
    );
    invalidateWorkspace();
  };

  return {
    reset,
    panel:
      active && evidence
        ? {
            current,
            evidence,
            inference,
            pending: {
              clear:
                clearResolution.isPending && clearWorkId.current === active.id,
              infer:
                inferResolution.isPending && inferWorkId.current === active.id,
              select:
                createResolution.isPending &&
                createWorkId.current === active.id,
            },
            onClear: () => {
              const work = active;
              clearWorkId.current = work.id;
              clearResolution.mutate(
                {
                  sourceId: target.sourceId,
                  stateId: target.stateId,
                  expectedDerivativeId: target.derivativeId,
                  componentIdentity: work.componentIdentity,
                  mentionId: work.mentionId,
                },
                {
                  onSuccess: () => {
                    if (!isCurrent(work)) return;
                    queryClient.setQueryData<ReadingWorkspaceModel>(
                      workspaceKey,
                      (workspace) => projectResolution(workspace, work),
                    );
                    invalidateWorkspace();
                  },
                },
              );
            },
            onInfer: () => {
              const work = active;
              inferWorkId.current = work.id;
              inferResolution.mutate(
                {
                  sourceId: target.sourceId,
                  stateId: target.stateId,
                  expectedDerivativeId: target.derivativeId,
                  componentIdentity: work.componentIdentity,
                  mentionId: work.mentionId,
                  consent: true,
                },
                {
                  onSuccess: (result) => {
                    if (isCurrent(work)) setInference(result);
                  },
                },
              );
            },
            onSelect: (
              candidate: Evidence["candidates"][number],
              selectedInference?: Extract<Inference, { status: "suggested" }>,
            ) => {
              if (!isCurrent(active)) return;
              createWorkId.current = active.id;
              createResolution.mutate(
                {
                  sourceId: target.sourceId,
                  stateId: target.stateId,
                  expectedDerivativeId: target.derivativeId,
                  componentIdentity: active.componentIdentity,
                  mentionId: active.mentionId,
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
                },
                {
                  onSuccess: (resolution) =>
                    updateResolution(active, resolution),
                },
              );
            },
          }
        : undefined,
  };
}

function projectResolution(
  workspace: ReadingWorkspaceModel | undefined,
  work: Pick<CitationResolutionWork, "componentIdentity" | "mentionId">,
  resolution?: CitationResolution,
) {
  return workspace
    ? {
        ...workspace,
        citationResolutions: [
          ...workspace.citationResolutions.filter(
            (candidate) =>
              candidate.componentIdentity !== work.componentIdentity ||
              candidate.mentionId !== work.mentionId,
          ),
          ...(resolution ? [resolution] : []),
        ],
      }
    : workspace;
}
