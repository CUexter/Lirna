import type { LibraryOutputs } from "@/clients/library";
import type { ReadingData } from "./content";
import type { ReadingSceneTopology } from "./reading-scene-topology";

export type ReadingWorkspaceModel = Pick<
  LibraryOutputs["sources"]["readingWorkspace"],
  "citationResolutions" | "reading"
>;

export type ReadingWorkspaceProjection =
  LibraryOutputs["sources"]["readingWorkspace"];

export type ReadingWorkspaceViewInput = {
  initialFragment?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: ReadingView, citation?: string) => void;
  selectedCitation?: string;
  tree: {
    component: ReadingData["components"][number];
    next?: ReadingData["components"][number];
    parent?: ReadingData["components"][number];
    previous?: ReadingData["components"][number];
    publisherNoteIdentity?: string;
    topology: ReadingSceneTopology;
  };
  view: ReadingView;
  model: ReadingWorkspaceModel;
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
