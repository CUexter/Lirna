import { authoredTarget, scrollToPendingFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
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
  view: "article" | "bibliography";
}) {
  const target = authoredTarget(reading, from, href);
  if (!target) return false;
  const authoredReference = referenceForAuthoredLink(
    referenceIndex,
    target,
    label,
  );
  if (authoredReference) {
    if (target.component.role === "notes")
      setNotesIdentity(target.component.identity);
    openReference(authoredReference);
    return true;
  }
  setSelectedReference(undefined);
  pendingFragment.current = target.fragment;
  highlightPendingFragment.current = true;
  if (target.component.role === "notes") {
    const notesAlreadyOpen = notesIdentity === target.component.identity;
    preserveScroll();
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
    setNotesIdentity(target.component.identity);
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
  reading,
  returnToCitation,
  setNotesIdentity,
  setReadingToolTab,
  targetComponentIdentity,
  view,
}: {
  component: SepReadingData["components"][number];
  handleComponentChange: (identity: string) => void;
  highlightPendingFragment: React.RefObject<boolean>;
  mentionId: string;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  pendingFragment: React.RefObject<string | undefined>;
  preserveScroll: () => void;
  reading: SepReadingData;
  returnToCitation: (mentionId: string) => void;
  setNotesIdentity: (identity: string | undefined) => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  targetComponentIdentity: string;
  view: "article" | "bibliography";
}) {
  const targetComponent = reading.components.find(
    (candidate) => candidate.identity === targetComponentIdentity,
  );
  if (targetComponent?.role === "notes") {
    pendingFragment.current = mentionId;
    highlightPendingFragment.current = true;
    preserveScroll();
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
    setNotesIdentity(targetComponent.identity);
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
