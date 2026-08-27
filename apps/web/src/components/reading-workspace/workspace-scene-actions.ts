import type { ReadingDerivative } from "./content";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingView } from "./workspace-types";

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
