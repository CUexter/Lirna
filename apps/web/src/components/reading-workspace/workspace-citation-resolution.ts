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
import { useWorkspaceCitationResolutionPanel } from "./workspace-citation-resolution-panel";
import type { ReadingView } from "./workspace-types";

type ReadingComponent = ReadingDerivative["components"][number];
interface CitationResolutionMovement {
  activatePassage: (activate: () => void) => void;
  cancel: (onCommit: () => void) => void;
  moveToComponent: (identity: string, onCommit: () => void) => void;
  openBibliography: (entryId?: string) => void;
  returnToCitationTarget: (
    mentionId: string,
    componentIdentity: string,
  ) => void;
}

interface WorkspaceCitationResolutionInput {
  evidenceAccess: "online" | "retained";
  movement: CitationResolutionMovement;
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
    toolsScrollRef: React.RefObject<HTMLDivElement | null>;
    view: ReadingView;
  };
  target: CitationResolutionTarget;
}

export function useWorkspaceCitationResolution({
  evidenceAccess,
  movement,
  reading,
  scene,
  target,
}: WorkspaceCitationResolutionInput) {
  const {
    articleRef,
    component,
    navigation,
    selectedCitation,
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
  const nextWorkId = useRef(0);
  const [active, setActive] = useState<CitationResolutionWork>();
  const activeWorkId = useRef<number | undefined>(undefined);
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
    movement.activatePassage(() => navigateToResolution(pending.resolution));
  }, [component.identity, movement, navigateToResolution]);

  const isCurrent = (work: CitationResolutionWork) =>
    sameCitationResolutionTarget(renderTarget.current, work.target) &&
    activeWorkId.current === work.id;
  const resolution = useWorkspaceCitationResolutionPanel({
    active,
    activeWorkId,
    cancel: movement.cancel,
    citationResolutions: reading.citationResolutions,
    evidenceAccess,
    isCurrent,
    nextWorkId,
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
    nextWorkId.current += 1;
    activeWorkId.current = undefined;
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
      id: ++nextWorkId.current,
      mentionId,
      target,
    };
    activeWorkId.current = work.id;
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
    movement.openBibliography(current?.bibliographyEntryId ?? entryId);
  };
  const returnToMention = createCitationReturnHandler({
    componentIdentity: component.identity,
    movement,
    navigateToResolution,
    pendingResolution,
    renderTarget,
    target,
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
  movement,
  navigateToResolution,
  pendingResolution,
  renderTarget,
  target,
}: {
  componentIdentity: string;
  movement: CitationResolutionMovement;
  navigateToResolution: (resolution: CitationResolution) => void;
  pendingResolution: React.RefObject<
    | { resolution: CitationResolution; target: CitationResolutionTarget }
    | undefined
  >;
  renderTarget: React.RefObject<CitationResolutionTarget>;
  target: CitationResolutionTarget;
}) {
  return (mention: BibliographyMention) => {
    if (mention.origin === "authored") {
      movement.returnToCitationTarget(mention.id, mention.componentIdentity);
      return;
    }
    if (mention.resolution.componentIdentity === componentIdentity) {
      movement.activatePassage(() => navigateToResolution(mention.resolution));
      return;
    }
    movement.moveToComponent(mention.resolution.componentIdentity, () => {
      if (!sameCitationResolutionTarget(renderTarget.current, target)) return;
      pendingResolution.current = { resolution: mention.resolution, target };
    });
  };
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
