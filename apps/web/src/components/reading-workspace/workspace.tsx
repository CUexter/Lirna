import type { LibraryOutputs } from "@/clients/library";
import { ComponentUnavailable } from "./component-unavailable";
import type { SepReadingData } from "./content";
import { createReadingSceneTopology } from "./reading-scene-topology";
import { ReadingWorkspaceView } from "./reading-workspace-view";
import { useReadingWorkspaceViewProps } from "./workspace-scene-navigation";
import { useComponentTree } from "./workspace-state";
import type { ReadingWorkspaceViewInput } from "./workspace-types";

type ReadingWorkspaceData = LibraryOutputs["sources"]["readingWorkspace"];

export type { SepReadingData };

export function SepReadingWorkspace({
  initialFragment,
  selectedComponent,
  view,
  selectedCitation,
  onComponentChange,
  onFragmentChange,
  onViewChange,
  workspace,
}: {
  initialFragment?: string;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  onComponentChange: (identity: string) => void;
  onFragmentChange: (fragment: string) => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
  workspace: ReadingWorkspaceData;
}) {
  const { reading } = workspace;
  const topology = createReadingSceneTopology(reading);
  const { component, parent, previous, next, publisherNoteIdentity } =
    useComponentTree(reading, selectedComponent, topology);
  if (!component) {
    return (
      <ComponentUnavailable
        componentIdentity={selectedComponent}
        mainComponentIdentity={reading.mainComponent.identity}
        onComponentChange={onComponentChange}
      />
    );
  }
  return (
    <AvailableReadingWorkspace
      initialFragment={initialFragment}
      onComponentChange={onComponentChange}
      onFragmentChange={onFragmentChange}
      onViewChange={onViewChange}
      selectedCitation={selectedCitation}
      tree={{
        component,
        next,
        parent,
        previous,
        publisherNoteIdentity,
        topology,
      }}
      view={view}
      workspace={workspace}
    />
  );
}

function AvailableReadingWorkspace(props: ReadingWorkspaceViewInput) {
  return <ReadingWorkspaceView {...useReadingWorkspaceViewProps(props)} />;
}
