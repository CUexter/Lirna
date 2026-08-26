import { scrollToPendingFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import type { ReadingSceneTopology } from "./reading-scene-topology";
import { resolveReadingSceneDestination } from "./reading-scene-topology";
import type { createAuthoredLinkHandler } from "./workspace-controller";
import type { WorkspaceSceneTransition } from "./workspace-scene-transitions";

export function createWorkspaceAuthoredSceneNavigator({
  articleRef,
  component,
  navigation,
  notesIdentity,
  requestTransition,
  toolsScrollRef,
  topology,
}: {
  articleRef: React.RefObject<HTMLElement | null>;
  component: SepReadingData["components"][number];
  navigation: ReadingNavigation;
  notesIdentity: string | undefined;
  requestTransition: (transition: WorkspaceSceneTransition) => boolean;
  toolsScrollRef: React.RefObject<HTMLDivElement | null>;
  topology: ReadingSceneTopology;
}) {
  return ({
    destination,
    from,
    fragment,
  }: Parameters<
    Parameters<typeof createAuthoredLinkHandler>[0]["navigateScene"]
  >[0]) => {
    const fromDestination = resolveReadingSceneDestination(topology, {
      sceneIdentity: from.identity,
      target: "component",
    });
    if (fromDestination.movement === "none") return false;
    const pendingFragment = fragment
      ? {
          fragment,
          owner: destination.owner,
          sceneIdentity: destination.scene.componentIdentity,
          target: destination.target,
        }
      : undefined;
    if (destination.scene.presentationRegion === "article") {
      if (destination.scene.componentIdentity === component.identity) {
        return requestTransition({
          activate: () => {
            if (!fragment) return;
            scrollToPendingFragment(
              { current: fragment },
              {
                cause: "pending-fragment",
                highlight: true,
                navigation,
                target: destination.target,
                targetRoot: articleRef,
              },
            );
          },
          destination,
          kind: "passage",
        });
      }
      return requestTransition({
        cause: "component-transition",
        destination,
        kind: "scene",
        originOwner: fromDestination.owner,
        pendingFragment,
        targetDescription: destination.scene.componentIdentity,
      });
    }
    const notesAlreadyOpen =
      notesIdentity === destination.scene.componentIdentity;
    if (fragment && notesAlreadyOpen) {
      return requestTransition({
        activate: () =>
          scrollToPendingFragment(
            { current: fragment },
            {
              cause: "pending-fragment",
              container: toolsScrollRef,
              highlight: true,
              navigation,
              target: destination.target,
              targetRoot: toolsScrollRef,
            },
          ),
        destination,
        kind: "passage",
      });
    }
    return requestTransition({
      cause: "publisher-note-navigation",
      destination,
      kind: "scene",
      originOwner: fromDestination.owner,
      pendingFragment,
      targetDescription: destination.scene.componentIdentity,
    });
  };
}
