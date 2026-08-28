import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { library } from "@/clients/library";
import { useAnchoredTargetNavigation } from "../annotations/annotations";
import type { CitationResolution } from "../annotations/dom-utils";
import type { BibliographyMention } from "./bibliography-mentions";
import {
  type CitationResolutionTarget,
  type CitationResolutionWork,
  useCitationResolutionWrites,
} from "./citation-resolution-writes";
import type { ReadingDerivative } from "./content";
import {
  observeReadingNavigation,
  readingToolsOwnerFor,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
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

  const citationEvidence = useQuery(
    library.citationResolutions.evidence.queryOptions({
      input: {
        expectedDerivativeId: target.derivativeId,
        sourceId: target.sourceId,
        stateId: target.stateId,
      },
    }),
  );
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
      !sameTarget(pending.target, renderTarget.current) ||
      pending.resolution.componentIdentity !== component.identity
    )
      return;
    pendingResolution.current = undefined;
    movement.activatePassage(() => navigateToResolution(pending.resolution));
  }, [component.identity, movement, navigateToResolution]);

  const activeEvidence = citationEvidence.data?.find(
    (item) =>
      item.derivativeId === target.derivativeId &&
      item.componentIdentity === active?.componentIdentity &&
      item.mentionId === active.mentionId,
  );
  const activeResolution = reading.citationResolutions.find(
    (item) =>
      item.derivativeId === target.derivativeId &&
      item.componentIdentity === active?.componentIdentity &&
      item.mentionId === active.mentionId,
  );

  const isCurrent = (work: CitationResolutionWork) =>
    sameTarget(renderTarget.current, work.target) &&
    activeWorkId.current === work.id;
  const writes = useCitationResolutionWrites({
    active,
    current: activeResolution,
    evidence: activeEvidence,
    isCurrent,
    target,
  });
  const resetWrites = useEffectEvent(writes.reset);
  useEffect(() => {
    const nextTarget = {
      derivativeId: targetDerivativeId,
      sourceId: targetSourceId,
      stateId: targetStateId,
    };
    if (sameTarget(lastResetTarget.current, nextTarget)) return;
    lastResetTarget.current = nextTarget;
    nextWorkId.current += 1;
    activeWorkId.current = undefined;
    setActive(undefined);
    setCitationComponentIdentity(undefined);
    pendingResolution.current = undefined;
    resetWrites();
  }, [targetDerivativeId, targetSourceId, targetStateId]);
  const begin = (
    sourceComponent: ReadingComponent,
    entryId: string | undefined,
    mentionId: string,
  ) => {
    const evidenceForMention = citationEvidence.data?.find(
      (item) =>
        item.derivativeId === target.derivativeId &&
        item.componentIdentity === sourceComponent.identity &&
        item.mentionId === mentionId,
    );
    const current = reading.citationResolutions.find(
      (item) =>
        item.derivativeId === target.derivativeId &&
        item.componentIdentity === sourceComponent.identity &&
        item.mentionId === mentionId,
    );
    if (evidenceForMention) {
      const work = {
        componentIdentity: sourceComponent.identity,
        id: ++nextWorkId.current,
        mentionId,
        target,
      };
      activeWorkId.current = work.id;
      setActive(work);
      writes.reset();
    }
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
    resolution: createResolutionPanel({
      active,
      activeWorkId,
      isCurrent,
      movement,
      nextWorkId,
      setActive,
      writes,
    }),
    returnToMention,
  };
}

function createResolutionPanel({
  active,
  activeWorkId,
  isCurrent,
  movement,
  nextWorkId,
  setActive,
  writes,
}: {
  active: CitationResolutionWork | undefined;
  activeWorkId: React.RefObject<number | undefined>;
  isCurrent: (work: CitationResolutionWork) => boolean;
  movement: CitationResolutionMovement;
  nextWorkId: React.RefObject<number>;
  setActive: React.Dispatch<
    React.SetStateAction<CitationResolutionWork | undefined>
  >;
  writes: ReturnType<typeof useCitationResolutionWrites>;
}) {
  if (!(writes.panel && active)) return undefined;
  return {
    ...writes.panel,
    onCancel: () =>
      movement.cancel(() => {
        if (!isCurrent(active)) return;
        nextWorkId.current += 1;
        activeWorkId.current = undefined;
        setActive(undefined);
        writes.reset();
      }),
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
      if (!sameTarget(renderTarget.current, target)) return;
      pendingResolution.current = { resolution: mention.resolution, target };
    });
  };
}

function sameTarget(
  left: CitationResolutionTarget,
  right: CitationResolutionTarget,
) {
  return (
    left.sourceId === right.sourceId &&
    left.stateId === right.stateId &&
    left.derivativeId === right.derivativeId
  );
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
