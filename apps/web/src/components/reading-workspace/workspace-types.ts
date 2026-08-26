import type { LibraryOutputs } from "@/clients/library";
import type { SepReadingData } from "./content";
import type { ReadingSceneTopology } from "./reading-scene-topology";

export type ReadingWorkspaceData =
  LibraryOutputs["sources"]["readingWorkspace"];

export type ReadingWorkspaceViewInput = {
  initialFragment?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: ReadingView, citation?: string) => void;
  selectedCitation?: string;
  tree: {
    component: SepReadingData["components"][number];
    next?: SepReadingData["components"][number];
    parent?: SepReadingData["components"][number];
    previous?: SepReadingData["components"][number];
    publisherNoteIdentity?: string;
    topology: ReadingSceneTopology;
  };
  view: ReadingView;
  workspace: ReadingWorkspaceData;
};

export type ReadingView = "article" | "bibliography";

export type PendingCitation = {
  componentIdentity: string;
  mentionId: string;
  owner: "article" | "publisher-note";
};

export type PendingSceneFragment = {
  fragment: string;
  owner: "article" | "publisher-note";
  sceneIdentity: string;
  target: string;
};
