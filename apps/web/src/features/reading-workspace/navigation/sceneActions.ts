import type { ReadingDerivative } from "../article/components/Content";
import type { ReadingToolTab } from "../tools/components/Panel";
import type { ReadingView } from "../types";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./sceneTopology";

export function initialReadingToolTab(
  view: ReadingView,
  initialNotesIdentity?: string,
): ReadingToolTab {
  if (view === "bibliography") return "bibliography";
  return initialNotesIdentity ? "supplementary" : "contents";
}

export function resolvePublisherNotes(
  reading: ReadingDerivative,
  notesIdentity: string | undefined,
  topology: ReadingSceneTopology,
) {
  const notes = reading.components.find(
    (item) => item.identity === notesIdentity,
  );
  const destination = notes
    ? resolveReadingSceneDestination(topology, {
        sceneIdentity: notes.identity,
        target: "component",
      })
    : undefined;
  return { notes, notesDestination: destination };
}
