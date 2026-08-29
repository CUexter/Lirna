import { useComponentTree } from "../hooks/useWorkspaceState";
import { useReadingWorkspaceViewProps } from "../navigation/hooks/useViewProps";
import { createReadingSceneTopology } from "../navigation/sceneTopology";
import type { ReadingWorkspaceViewInput } from "../types";
import { ComponentUnavailable } from "./ComponentUnavailable";
import { ReadingWorkspaceView } from "./View";

export function ReadingWorkspace({
  initialFragment,
  selectedComponent,
  view,
  selectedCitation,
  navigation,
  model,
}: {
  initialFragment?: string;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  navigation: Pick<
    ReadingWorkspaceViewInput,
    | "onComponentChange"
    | "onFragmentChange"
    | "onViewChange"
    | "onWorkspaceLeave"
  >;
  model: ReadingWorkspaceViewInput["model"];
}) {
  const { reading } = model;
  const topology = createReadingSceneTopology(reading);
  const { component, parent, previous, next, publisherNoteIdentity } =
    useComponentTree(reading, selectedComponent, topology);
  if (!component) {
    return (
      <ComponentUnavailable
        componentIdentity={selectedComponent}
        mainComponentIdentity={reading.mainComponent.identity}
        onComponentChange={navigation.onComponentChange}
      />
    );
  }
  return (
    <AvailableReadingWorkspace
      initialFragment={initialFragment}
      onComponentChange={navigation.onComponentChange}
      onFragmentChange={navigation.onFragmentChange}
      onWorkspaceLeave={navigation.onWorkspaceLeave}
      onViewChange={navigation.onViewChange}
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
      model={model}
    />
  );
}

function AvailableReadingWorkspace(props: ReadingWorkspaceViewInput) {
  return <ReadingWorkspaceView {...useReadingWorkspaceViewProps(props)} />;
}
