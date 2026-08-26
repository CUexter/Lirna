import { authoredTarget, componentHasFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";
import {
  type ReadingReference,
  type ReferenceIndex,
  referenceForAuthoredLink,
} from "./references";

export function navigateAuthoredLink({
  from,
  href,
  label,
  navigateScene,
  openReference,
  reading,
  referenceIndex,
  setSelectedReference,
  topology,
}: {
  from: SepReadingData["components"][number];
  href: string;
  label: string;
  navigateScene: (options: {
    destination: Extract<
      ReturnType<typeof resolveReadingSceneDestination>,
      { movement: "move" }
    >;
    from: SepReadingData["components"][number];
    fragment?: string;
  }) => boolean;
  openReference: (reference: ReadingReference) => void;
  reading: SepReadingData;
  referenceIndex: ReferenceIndex;
  setSelectedReference: (reference: ReadingReference | undefined) => void;
  topology: ReadingSceneTopology;
}) {
  const target = authoredTarget(reading, from, href);
  if (!target) return false;
  if (
    target.fragment &&
    !componentHasFragment(target.component, target.fragment)
  )
    return true;
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: target.component.identity,
    target: target.fragment ? `fragment:${target.fragment}` : "component",
  });
  if (destination.movement === "none") return false;
  const authoredReference = referenceForAuthoredLink(
    referenceIndex,
    target,
    label,
    topology,
  );
  if (authoredReference && destination.owner !== "publisher-note") {
    openReference(authoredReference);
    return true;
  }
  setSelectedReference(undefined);
  return navigateScene({ destination, from, fragment: target.fragment });
}

export function citationDestination(
  topology: ReadingSceneTopology,
  currentComponentIdentity: string,
  targetComponentIdentity: string,
  mentionId: string,
) {
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: targetComponentIdentity,
    target: `citation:${mentionId}`,
  });
  if (destination.movement === "none") return { kind: "none" as const };
  if (destination.owner === "publisher-note") {
    return {
      kind: "publisher-note" as const,
      componentIdentity: destination.scene.componentIdentity,
      owner: destination.owner,
    };
  }
  return targetComponentIdentity === currentComponentIdentity
    ? { kind: "current" as const, owner: destination.owner }
    : { kind: "component" as const, owner: destination.owner };
}

export function completeCitationNavigation({
  destination,
  handleComponentChange,
  mentionId,
  onPending,
  onViewChange,
  preserveScroll,
  returnToCitation,
  setNotesIdentity,
  setReadingToolTab,
  targetComponentIdentity,
  view,
}: {
  destination: ReturnType<typeof citationDestination>;
  handleComponentChange: (identity: string) => void;
  mentionId: string;
  onPending: (owner: "article" | "publisher-note") => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  preserveScroll: () => void;
  returnToCitation: (mentionId: string) => void;
  setNotesIdentity: (identity: string | undefined) => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  targetComponentIdentity: string;
  view: "article" | "bibliography";
}) {
  if (destination.kind === "none") return;
  if (destination.kind === "publisher-note") {
    onPending(destination.owner);
    preserveScroll();
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
    setNotesIdentity(destination.componentIdentity);
    return;
  }
  if (destination.kind === "current") {
    returnToCitation(mentionId);
    onViewChange("article");
    return;
  }
  onPending(destination.owner);
  handleComponentChange(targetComponentIdentity);
}
