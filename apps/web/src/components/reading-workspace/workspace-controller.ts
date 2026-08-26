import type { Dispatch, SetStateAction } from "react";

import type { SepReadingData } from "./content";
import type { ReadingToolTab } from "./reading-tools-panel";
import { navigateAuthoredLink } from "./workspace-navigation";

type SetState<T> = Dispatch<SetStateAction<T>>;
type ReadingView = "article" | "bibliography";

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
