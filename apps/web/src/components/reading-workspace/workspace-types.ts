import type { LibraryOutputs } from "@/clients/library";
import type { ReadingDerivative } from "./content";
import type { ReadingSceneTopology } from "./reading-scene-topology";

export type ReadingWorkspaceModel = Pick<
  LibraryOutputs["sources"]["readingWorkspace"],
  "citationResolutions" | "reading" | "state"
> & { evidenceAccess: "online" | "retained" };

export type ReadingWorkspaceViewInput = {
  initialFragment?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: ReadingView, citation?: string) => void;
  selectedCitation?: string;
  tree: {
    component: ReadingDerivative["components"][number];
    next?: ReadingDerivative["components"][number];
    parent?: ReadingDerivative["components"][number];
    previous?: ReadingDerivative["components"][number];
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
