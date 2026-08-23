import { authoredTarget, scrollToPendingFragment } from "./authored-navigation";
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
  component,
  from,
  handleComponentChange,
  highlightPendingFragment,
  href,
  label,
  notesIdentity,
  onViewChange,
  openReference,
  pendingFragment,
  preserveScroll,
  reading,
  referenceIndex,
  setNotesIdentity,
  setReadingToolTab,
  setSelectedReference,
  toolsScrollRef,
  topology,
  view,
}: {
  component: SepReadingData["components"][number];
  from: SepReadingData["components"][number];
  handleComponentChange: (identity: string) => void;
  highlightPendingFragment: React.RefObject<boolean>;
  href: string;
  label: string;
  notesIdentity?: string;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  openReference: (reference: ReadingReference) => void;
  pendingFragment: React.RefObject<string | undefined>;
  preserveScroll: () => void;
  reading: SepReadingData;
  referenceIndex: ReferenceIndex;
  setNotesIdentity: (identity: string | undefined) => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  setSelectedReference: (reference: ReadingReference | undefined) => void;
  toolsScrollRef: React.RefObject<HTMLDivElement | null>;
  topology: ReadingSceneTopology;
  view: "article" | "bibliography";
}) {
  const target = authoredTarget(reading, from, href);
  if (!target) return false;
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
  if (authoredReference) {
    if (destination.owner === "publisher-note")
      setNotesIdentity(destination.scene.componentIdentity);
    openReference(authoredReference);
    return true;
  }
  setSelectedReference(undefined);
  pendingFragment.current = target.fragment;
  highlightPendingFragment.current = true;
  if (destination.owner === "publisher-note") {
    const notesAlreadyOpen =
      notesIdentity === destination.scene.componentIdentity;
    preserveScroll();
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
    setNotesIdentity(destination.scene.componentIdentity);
    if (notesAlreadyOpen) {
      scrollToPendingFragment(pendingFragment, {
        container: toolsScrollRef,
        highlight: true,
      });
      highlightPendingFragment.current = false;
    }
  } else if (target.component.identity === component.identity) {
    setNotesIdentity(undefined);
    scrollToPendingFragment(pendingFragment, { highlight: true });
    highlightPendingFragment.current = false;
  } else {
    handleComponentChange(target.component.identity);
  }
  return true;
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
