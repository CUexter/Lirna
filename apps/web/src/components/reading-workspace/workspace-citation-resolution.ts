import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useAnchoredTargetNavigation } from "../annotations/annotations";
import type { CitationResolution } from "../annotations/dom-utils";
import type { BibliographyMention } from "./bibliography-mentions";
import { sameCitationResolutionTarget } from "./citation-resolution-consequences";
import type {
  CitationResolutionTarget,
  CitationResolutionWork,
} from "./citation-resolution-module";
import type { ReadingDerivative } from "./content";
import {
  observeReadingNavigation,
  readingToolsOwnerFor,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import { useWorkspaceCitationResolutionPanel } from "./workspace-citation-resolution-panel";
import type { WorkspaceSceneTransitionRequest } from "./workspace-scene-transitions";
import type { ReadingView } from "./workspace-types";

type ReadingComponent = ReadingDerivative["components"][number];

interface WorkspaceCitationResolutionInput {
  evidenceAccess: "online" | "retained";
  reading: {
    citationResolutions: CitationResolution[];
    components: ReadingDerivative["components"];
    mainComponentIdentity: string;
  };
  scene: {
    articleRef: React.RefObject<HTMLElement | null>;
    component: ReadingComponent;
    navigation: ReadingNavigation;
    selectedCitation?: string;
    topology: ReadingSceneTopology;
    toolsScrollRef: React.RefObject<HTMLDivElement | null>;
    view: ReadingView;
  };
  requestTransition: WorkspaceSceneTransitionRequest;
  target: CitationResolutionTarget;
}

export function useWorkspaceCitationResolution({
  evidenceAccess,
  reading,
  requestTransition,
  scene,
  target,
}: WorkspaceCitationResolutionInput) {
  const {
    articleRef,
    component,
    navigation,
    selectedCitation,
    topology,
    toolsScrollRef,
    view,
  } = scene;
  const {
    derivativeId: targetDerivativeId,
    sourceId: targetSourceId,
    stateId: targetStateId,
  } = target;
  const renderTarget = useRef(target);
  const lastResetTarget = useRef(target);
  renderTarget.current = target;
  const nextWorkSequence = useRef(0);
  const [active, setActive] = useState<CitationResolutionWork>();
  const activeWorkSequence = useRef<number | undefined>(undefined);
  const [citationComponentIdentity, setCitationComponentIdentity] =
    useState<string>();
  const pendingResolution = useRef<
    | {
        resolution: CitationResolution;
        target: CitationResolutionTarget;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    if (view !== "bibliography") return;
    observeReadingNavigation({
      cause: "bibliography-opening",
      owner: readingToolsOwnerFor(toolsScrollRef.current),
      target: selectedCitation
        ? `bibliography:${citationComponentIdentity ?? component.identity}:${selectedCitation}`
        : "bibliography",
    });
  }, [
    citationComponentIdentity,
    component.identity,
    selectedCitation,
    toolsScrollRef,
    view,
  ]);

  const navigateToResolution = useAnchoredTargetNavigation({
    articleRef,
    componentIdentity: component.identity,
    navigation,
    plainText: component.plainText,
    targetKind: "citation-resolution",
  });
  useEffect(() => {
    const pending = pendingResolution.current;
    if (
      !pending ||
      !sameCitationResolutionTarget(pending.target, renderTarget.current) ||
      pending.resolution.componentIdentity !== component.identity
    )
      return;
    pendingResolution.current = undefined;
    requestPassageActivation({
      activate: () => navigateToResolution(pending.resolution),
      componentIdentity: component.identity,
      requestTransition,
      topology,
    });
  }, [component.identity, navigateToResolution, requestTransition, topology]);

  const isCurrent = (work: CitationResolutionWork) =>
    sameCitationResolutionTarget(renderTarget.current, work.target) &&
    activeWorkSequence.current === work.sequence;
  const resolution = useWorkspaceCitationResolutionPanel({
    active,
    activeWorkSequence,
    cancel: (onCommit) => requestTransition({ kind: "article" }, onCommit),
    citationResolutions: reading.citationResolutions,
    evidenceAccess,
    isCurrent,
    nextWorkSequence,
    setActive,
    target,
  });
  const resetWork = useEffectEvent(resolution.resetWork);
  useEffect(() => {
    const nextTarget = {
      derivativeId: targetDerivativeId,
      sourceId: targetSourceId,
      stateId: targetStateId,
    };
    if (sameCitationResolutionTarget(lastResetTarget.current, nextTarget))
      return;
    lastResetTarget.current = nextTarget;
    nextWorkSequence.current += 1;
    activeWorkSequence.current = undefined;
    setActive(undefined);
    setCitationComponentIdentity(undefined);
    pendingResolution.current = undefined;
    resetWork();
  }, [targetDerivativeId, targetSourceId, targetStateId]);
  const begin = (
    sourceComponent: ReadingComponent,
    entryId: string | undefined,
    mentionId: string,
  ) => {
    const current = reading.citationResolutions.find(
      (item) =>
        item.derivativeId === target.derivativeId &&
        item.componentIdentity === sourceComponent.identity &&
        item.mentionId === mentionId,
    );
    const work = {
      componentIdentity: sourceComponent.identity,
      mentionId,
      sequence: ++nextWorkSequence.current,
      target,
    };
    activeWorkSequence.current = work.sequence;
    setActive(work);
    resolution.resetWork(work);
    const bibliographyComponent = bibliographyOwner(
      sourceComponent,
      entryId,
      reading.components,
      reading.mainComponentIdentity,
    );
    setCitationComponentIdentity(
      bibliographyComponent?.identity ?? sourceComponent.identity,
    );
    requestTransition({
      entryId: current?.bibliographyEntryId ?? entryId,
      kind: "bibliography",
    });
  };
  const returnToMention = createCitationReturnHandler({
    componentIdentity: component.identity,
    navigateToResolution,
    pendingResolution,
    renderTarget,
    requestTransition,
    target,
    topology,
  });

  return {
    citationResolutions: resolution.citationResolutions,
    citationComponentIdentity,
    openCurrent: (entryId: string | undefined, mentionId: string) =>
      begin(component, entryId, mentionId),
    openFrom: (
      sourceComponent: ReadingComponent,
      entryId: string | undefined,
      mentionId: string,
    ) => begin(sourceComponent, entryId, mentionId),
    openManual: (
      entryId: string,
      resolutionId: string,
      bibliographyComponentIdentity: string,
    ) =>
      openManualResolution({
        components: reading.components,
        begin,
        entryId,
        resolutionId,
        bibliographyComponentIdentity,
      }),
    resolution: resolution.panel,
    returnToMention,
  };
}

function openManualResolution({
  components,
  begin,
  entryId,
  resolutionId,
  bibliographyComponentIdentity,
}: {
  components: ReadingDerivative["components"];
  begin: (
    component: ReadingComponent,
    entryId: string,
    resolutionId: string,
  ) => void;
  entryId: string;
  resolutionId: string;
  bibliographyComponentIdentity: string;
}) {
  const bibliographyComponent = components.find(
    (candidate) => candidate.identity === bibliographyComponentIdentity,
  );
  if (bibliographyComponent)
    begin(bibliographyComponent, entryId, resolutionId);
}

function createCitationReturnHandler({
  componentIdentity,
  navigateToResolution,
  pendingResolution,
  renderTarget,
  requestTransition,
  target,
  topology,
}: {
  componentIdentity: string;
  navigateToResolution: (resolution: CitationResolution) => void;
  pendingResolution: React.RefObject<
    | { resolution: CitationResolution; target: CitationResolutionTarget }
    | undefined
  >;
  renderTarget: React.RefObject<CitationResolutionTarget>;
  requestTransition: WorkspaceSceneTransitionRequest;
  target: CitationResolutionTarget;
  topology: ReadingSceneTopology;
}) {
  return (mention: BibliographyMention) => {
    if (mention.origin === "authored") {
      requestTransition({
        kind: "citation",
        mentionId: mention.id,
        targetComponentIdentity: mention.componentIdentity,
      });
      return;
    }
    if (mention.resolution.componentIdentity === componentIdentity) {
      requestPassageActivation({
        activate: () => navigateToResolution(mention.resolution),
        componentIdentity,
        requestTransition,
        topology,
      });
      return;
    }
    requestTransition(
      {
        identity: mention.resolution.componentIdentity,
        kind: "component",
        originOwner: "article",
      },
      () => {
        if (!sameCitationResolutionTarget(renderTarget.current, target)) return;
        pendingResolution.current = { resolution: mention.resolution, target };
      },
    );
  };
}

function requestPassageActivation({
  activate,
  componentIdentity,
  requestTransition,
  topology,
}: {
  activate: () => void;
  componentIdentity: string;
  requestTransition: WorkspaceSceneTransitionRequest;
  topology: ReadingSceneTopology;
}) {
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: componentIdentity,
    target: "citation:resolved-passage",
  });
  if (destination.movement === "move") {
    requestTransition({ activate, destination, kind: "passage" });
    return;
  }
  requestTransition({
    kind: "unavailable",
    reason: destination.reason,
    targetDescription: "Citation resolution passage",
  });
}

function bibliographyOwner(
  component: ReadingComponent,
  entryId: string | undefined,
  components: ReadingDerivative["components"],
  mainComponentIdentity: string,
) {
  if (!entryId) return undefined;
  return component.bibliography.some((group) =>
    group.entries.some((entry) => entry.id === entryId),
  )
    ? component
    : components.find(
        (candidate) => candidate.identity === mainComponentIdentity,
      );
}
