import type { Dispatch, SetStateAction } from "react";

import type { ReadingToolTab } from "./tools/components/Panel";

type SetState<T> = Dispatch<SetStateAction<T>>;
type ReadingView = "article" | "bibliography";

export function createClearEditingAnnotationHandler(
  setEditingAnnotationId: SetState<string | undefined>,
) {
  return () => setEditingAnnotationId(undefined);
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
