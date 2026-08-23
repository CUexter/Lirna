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

export function navigateToCitation({
  component,
  handleComponentChange,
  highlightPendingFragment,
  mentionId,
  onViewChange,
  pendingFragment,
  preserveScroll,
  returnToCitation,
  setNotesIdentity,
  setReadingToolTab,
  targetComponentIdentity,
  topology,
  view,
}: {
  component: SepReadingData["components"][number];
  handleComponentChange: (identity: string) => void;
  highlightPendingFragment: React.RefObject<boolean>;
  mentionId: string;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  pendingFragment: React.RefObject<string | undefined>;
  preserveScroll: () => void;
  returnToCitation: (mentionId: string) => void;
  setNotesIdentity: (identity: string | undefined) => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  targetComponentIdentity: string;
  topology: ReadingSceneTopology;
  view: "article" | "bibliography";
}) {
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: targetComponentIdentity,
    target: `citation:${mentionId}`,
  });
  if (destination.movement === "none") return;
  if (destination.owner === "publisher-note") {
    pendingFragment.current = mentionId;
    highlightPendingFragment.current = true;
    preserveScroll();
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
    setNotesIdentity(destination.scene.componentIdentity);
    return;
  }
  if (targetComponentIdentity === component.identity) {
    returnToCitation(mentionId);
    onViewChange("article");
    return;
  }
  pendingFragment.current = mentionId;
  highlightPendingFragment.current = true;
  handleComponentChange(targetComponentIdentity);
}
