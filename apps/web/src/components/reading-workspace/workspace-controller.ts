import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
} from "react";

import { scrollToPendingFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingReference } from "./references";
import {
  navigateAuthoredLink,
  navigateToCitation,
} from "./workspace-navigation";

type SetState<T> = Dispatch<SetStateAction<T>>;
type ReadingView = "article" | "bibliography";

export function createComponentChangeHandler({
  onComponentChange,
  saveLocation,
  setEditingAnnotationId,
  setNotesIdentity,
  setSelectedReference,
}: {
  onComponentChange: (identity: string) => void;
  saveLocation: () => void;
  setEditingAnnotationId: SetState<string | undefined>;
  setNotesIdentity: SetState<string | undefined>;
  setSelectedReference: SetState<ReadingReference | undefined>;
}) {
  return (identity: string) => {
    setEditingAnnotationId(undefined);
    setNotesIdentity(undefined);
    setSelectedReference(undefined);
    saveLocation();
    onComponentChange(identity);
  };
}

export function createOpenReferenceHandler({
  onViewChange,
  preserveScroll,
  setReadingToolTab,
  setSelectedReference,
  view,
}: {
  onViewChange: (view: ReadingView) => void;
  preserveScroll: () => void;
  setReadingToolTab: SetState<ReadingToolTab>;
  setSelectedReference: SetState<ReadingReference | undefined>;
  view: ReadingView;
}) {
  return (reference: ReadingReference) => {
    preserveScroll();
    setSelectedReference(reference);
    setReadingToolTab("supplementary");
    if (view === "bibliography") onViewChange("article");
  };
}

export function createAuthoredLinkHandler(
  context: Omit<
    Parameters<typeof navigateAuthoredLink>[0],
    "from" | "href" | "label"
  >,
) {
  return (
    from: SepReadingData["components"][number],
    href: string,
    label: string,
  ) => navigateAuthoredLink({ ...context, from, href, label });
}

export function createOpenCitationHandler({
  openBibliography,
  setCitationScrollRequest,
  setNotesIdentity,
  setReadingToolTab,
  setSelectedReference,
}: {
  openBibliography: (entryId?: string) => void;
  setCitationScrollRequest: SetState<number>;
  setNotesIdentity: SetState<string | undefined>;
  setReadingToolTab: SetState<ReadingToolTab>;
  setSelectedReference: SetState<ReadingReference | undefined>;
}) {
  return (entryId: string | undefined, _mentionId: string) => {
    setNotesIdentity(undefined);
    setSelectedReference(undefined);
    setReadingToolTab("bibliography");
    setCitationScrollRequest((request) => request + 1);
    openBibliography(entryId);
  };
}

export function createReadingToolTabChangeHandler({
  onViewChange,
  saveLocation,
  setReadingToolTab,
  view,
}: {
  onViewChange: (view: ReadingView) => void;
  saveLocation: () => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  view: ReadingView;
}) {
  return (tab: ReadingToolTab) =>
    changeReadingToolTab(tab, {
      onViewChange,
      saveLocation,
      setReadingToolTab,
      view,
    });
}

export function createReturnToCitationHandler(
  context: Omit<
    Parameters<typeof navigateToCitation>[0],
    "mentionId" | "targetComponentIdentity"
  >,
) {
  return (mentionId: string, targetComponentIdentity: string) =>
    navigateToCitation({ ...context, mentionId, targetComponentIdentity });
}

export function createClearEditingAnnotationHandler(
  setEditingAnnotationId: SetState<string | undefined>,
) {
  return () => setEditingAnnotationId(undefined);
}

export function createCurrentAuthoredLinkHandler(
  component: SepReadingData["components"][number],
  openAuthoredLink: ReturnType<typeof createAuthoredLinkHandler>,
) {
  return (href: string, label: string) =>
    openAuthoredLink(component, href, label);
}

export function usePendingFragmentScroll({
  componentIdentity,
  highlightPendingFragment,
  initialFragment,
  notesIdentity,
  pendingFragment,
  toolsScrollRef,
}: {
  componentIdentity?: string;
  highlightPendingFragment: RefObject<boolean>;
  initialFragment?: string;
  notesIdentity?: string;
  pendingFragment: RefObject<string | undefined>;
  toolsScrollRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (initialFragment && !pendingFragment.current) {
      pendingFragment.current = initialFragment;
    }
    if (!componentIdentity && !notesIdentity) return;
    scrollToPendingFragment(pendingFragment, {
      container: notesIdentity ? toolsScrollRef : undefined,
      highlight: highlightPendingFragment.current,
    });
    highlightPendingFragment.current = false;
  }, [
    componentIdentity,
    highlightPendingFragment,
    initialFragment,
    notesIdentity,
    pendingFragment,
    toolsScrollRef,
  ]);
}

export function activeReadingToolTab(
  view: ReadingView,
  readingToolTab: ReadingToolTab,
): ReadingToolTab {
  return view === "bibliography" ? "bibliography" : readingToolTab;
}

export function selectedCitationForView(
  view: ReadingView,
  selectedCitation?: string,
) {
  return view === "bibliography" ? selectedCitation : undefined;
}

function changeReadingToolTab(
  tab: ReadingToolTab,
  {
    onViewChange,
    saveLocation,
    setReadingToolTab,
    view,
  }: {
    onViewChange: (view: ReadingView) => void;
    saveLocation: () => void;
    setReadingToolTab: (tab: ReadingToolTab) => void;
    view: ReadingView;
  },
) {
  setReadingToolTab(tab);
  if (tab === "bibliography" && view !== "bibliography") {
    saveLocation();
    onViewChange("bibliography");
  } else if (tab !== "bibliography" && view === "bibliography") {
    onViewChange("article");
  }
}
