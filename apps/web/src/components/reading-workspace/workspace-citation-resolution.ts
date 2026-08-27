import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { type LibraryOutputs, library } from "@/clients/library";
import { useAnchoredTargetNavigation } from "../annotations/annotations";
import type { CitationResolution } from "../annotations/dom-utils";
import type { BibliographyMention } from "./bibliography-mentions";
import { useCitationOpening } from "./citation-opening";
import type { ReadingData } from "./content";
import { useReadingNavigationObservations } from "./navigation-observer";
import type { ReadingNavigation } from "./reading-navigation";
import type { ReadingReference } from "./references";
import type {
  ReadingView,
  ReadingWorkspaceProjection,
} from "./workspace-types";

export function useWorkspaceCitationResolution([
  articleRef,
  citationResolutions,
  component,
  handleComponentChange,
  navigation,
  notesIdentity,
  onViewChange,
  openCitation,
  reading,
  returnToCitationTarget,
  selectedCitation,
  selectedReference,
  toolsScrollRef,
  view,
]: [
  articleRef: React.RefObject<HTMLElement | null>,
  citationResolutions: CitationResolution[],
  component: ReadingData["components"][number],
  handleComponentChange: (identity: string) => void,
  navigation: ReadingNavigation,
  notesIdentity: string | undefined,
  onViewChange: (view: ReadingView, citation?: string) => void,
  openCitation: Parameters<typeof useCitationOpening>[3],
  reading: ReadingData,
  returnToCitationTarget: (
    mentionId: string,
    componentIdentity: string,
  ) => void,
  selectedCitation: string | undefined,
  selectedReference: ReadingReference | undefined,
  toolsScrollRef: React.RefObject<HTMLDivElement | null>,
  view: ReadingView,
]) {
  const { source } = reading;
  const { citationComponentIdentity, openCitationFrom, openCurrentCitation } =
    useCitationOpening(
      component,
      reading.components,
      reading.mainComponent.identity,
      openCitation,
    );
  useReadingNavigationObservations({
    componentIdentity: component.identity,
    navigation,
    notesIdentity,
    selectedCitation,
    selectedCitationComponentIdentity: citationComponentIdentity,
    selectedReference,
    toolsScrollRef,
    view,
  });
  const queryClient = useQueryClient();
  const navigateToCitationResolution = useAnchoredTargetNavigation({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    plainText: component.plainText,
    targetKind: "citation-resolution",
  });
  const pendingCitationResolution = useRef<CitationResolution | undefined>(
    undefined,
  );
  useEffect(() => {
    const resolution = pendingCitationResolution.current;
    if (!resolution || resolution.componentIdentity !== component.identity)
      return;
    pendingCitationResolution.current = undefined;
    navigateToCitationResolution(resolution);
  }, [component.identity, navigateToCitationResolution]);
  const [resolvingMention, setResolvingMention] = useState<{
    componentIdentity: string;
    mentionId: string;
  }>();
  const citationEvidence = useQuery(
    library.citationResolutions.evidence.queryOptions({
      input: { sourceId: source.id, stateId: source.stateId },
    }),
  );
  const createResolution = useMutation(
    library.citationResolutions.create.mutationOptions(),
  );
  const clearResolution = useMutation(
    library.citationResolutions.clear.mutationOptions(),
  );
  const inferResolution = useMutation(
    library.citationResolutions.infer.mutationOptions(),
  );
  const beginResolution = (
    sourceComponentIdentity: string,
    entryId: string | undefined,
    mentionId: string,
    open: (entryId: string | undefined, mentionId: string) => void,
  ) => {
    const evidence = citationEvidence.data?.find(
      (item) =>
        item.componentIdentity === sourceComponentIdentity &&
        item.mentionId === mentionId,
    );
    const current = citationResolutions.find(
      (item) =>
        item.componentIdentity === sourceComponentIdentity &&
        item.mentionId === mentionId,
    );
    if (evidence) {
      setResolvingMention({
        componentIdentity: sourceComponentIdentity,
        mentionId,
      });
      inferResolution.reset();
    }
    open(current?.bibliographyEntryId ?? entryId, mentionId);
  };
  const openCurrent = (entryId: string | undefined, mentionId: string) =>
    beginResolution(
      component.identity,
      entryId,
      mentionId,
      openCurrentCitation,
    );
  const openFrom = (
    sourceComponent: ReadingData["components"][number],
    entryId: string | undefined,
    mentionId: string,
  ) =>
    beginResolution(
      sourceComponent.identity,
      entryId,
      mentionId,
      (targetEntryId, targetMentionId) =>
        openCitationFrom(sourceComponent, targetEntryId, targetMentionId),
    );
  const openManual = (
    entryId: string,
    resolutionId: string,
    bibliographyComponentIdentity: string,
  ) => {
    const bibliographyComponent = reading.components.find(
      (candidate) => candidate.identity === bibliographyComponentIdentity,
    );
    if (bibliographyComponent)
      openCitationFrom(bibliographyComponent, entryId, resolutionId);
  };
  const returnToMention = (mention: BibliographyMention) => {
    if (mention.origin === "authored") {
      returnToCitationTarget(mention.id, mention.componentIdentity);
      return;
    }
    const { resolution } = mention;
    if (resolution.componentIdentity === component.identity) {
      navigateToCitationResolution(resolution);
      onViewChange("article");
      return;
    }
    pendingCitationResolution.current = resolution;
    handleComponentChange(resolution.componentIdentity);
  };
  const activeEvidence = citationEvidence.data?.find(
    (item) =>
      item.componentIdentity === resolvingMention?.componentIdentity &&
      item.mentionId === resolvingMention.mentionId,
  );
  const activeResolution = citationResolutions.find(
    (item) =>
      item.componentIdentity === resolvingMention?.componentIdentity &&
      item.mentionId === resolvingMention.mentionId,
  );
  const workspaceKey = library.sources.readingWorkspace.key({
    input: { sourceId: source.id, stateId: source.stateId },
  });
  const updateResolution = (resolution: CitationResolution) => {
    queryClient.setQueryData<ReadingWorkspaceProjection>(
      workspaceKey,
      (workspace) =>
        workspace
          ? {
              ...workspace,
              citationResolutions: [
                ...workspace.citationResolutions.filter(
                  (candidate) =>
                    candidate.componentIdentity !==
                      resolution.componentIdentity ||
                    candidate.mentionId !== resolution.mentionId,
                ),
                resolution,
              ],
            }
          : workspace,
    );
    queryClient.invalidateQueries({ queryKey: workspaceKey });
  };
  const selectCandidate = (
    candidate: NonNullable<typeof activeEvidence>["candidates"][number],
    inference?: Extract<
      LibraryOutputs["citationResolutions"]["infer"],
      { status: "suggested" }
    >,
  ) => {
    if (!activeEvidence) return;
    createResolution.mutate(
      {
        sourceId: source.id,
        stateId: source.stateId,
        componentIdentity: activeEvidence.componentIdentity,
        mentionId: activeEvidence.mentionId,
        bibliographyComponentIdentity: candidate.bibliographyComponentIdentity,
        bibliographyEntryId: candidate.bibliographyEntryId,
        method: inference ? "inferred" : "manual",
        ...(inference
          ? { confidence: inference.confidence, reasoning: inference.reasoning }
          : {}),
      },
      { onSuccess: updateResolution },
    );
  };
  return {
    citationComponentIdentity,
    openCurrent,
    openFrom,
    openManual,
    resolution: activeEvidence
      ? {
          current: activeResolution,
          evidence: activeEvidence,
          inference: inferResolution.data,
          pending: {
            clear: clearResolution.isPending,
            infer: inferResolution.isPending,
            select: createResolution.isPending,
          },
          onCancel: () => {
            inferResolution.reset();
            setResolvingMention(undefined);
            onViewChange("article");
          },
          onClear: () =>
            clearResolution.mutate(
              {
                sourceId: source.id,
                stateId: source.stateId,
                componentIdentity: activeEvidence.componentIdentity,
                mentionId: activeEvidence.mentionId,
              },
              {
                onSuccess: () => {
                  queryClient.setQueryData<ReadingWorkspaceProjection>(
                    workspaceKey,
                    (workspace) =>
                      workspace
                        ? {
                            ...workspace,
                            citationResolutions:
                              workspace.citationResolutions.filter(
                                (candidate) =>
                                  candidate.componentIdentity !==
                                    activeEvidence.componentIdentity ||
                                  candidate.mentionId !==
                                    activeEvidence.mentionId,
                              ),
                          }
                        : workspace,
                  );
                  queryClient.invalidateQueries({ queryKey: workspaceKey });
                },
              },
            ),
          onInfer: () =>
            inferResolution.mutate({
              sourceId: source.id,
              stateId: source.stateId,
              componentIdentity: activeEvidence.componentIdentity,
              mentionId: activeEvidence.mentionId,
              consent: true,
            }),
          onSelect: selectCandidate,
        }
      : undefined,
    returnToMention,
  };
}
