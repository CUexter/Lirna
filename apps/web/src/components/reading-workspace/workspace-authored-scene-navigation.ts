import { scrollToPendingFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import type { ReadingSceneTopology } from "./reading-scene-topology";
import { resolveReadingSceneDestination } from "./reading-scene-topology";
import type { createAuthoredLinkHandler } from "./workspace-controller";
import type { PendingSceneFragment, ReadingView } from "./workspace-types";

export function createWorkspaceAuthoredSceneNavigator([
  articleRef,
  changeArticleScene,
  component,
  navigation,
  notesIdentity,
  onViewChange,
  pendingSceneFragment,
  saveLocation,
  setNotesIdentity,
  setReadingToolTab,
  toolsScrollRef,
  topology,
  view,
]: [
  articleRef: React.RefObject<HTMLElement | null>,
  changeArticleScene: (
    identity: string,
    retainPublisherNotes?: boolean,
  ) => void,
  component: SepReadingData["components"][number],
  navigation: ReadingNavigation,
  notesIdentity: string | undefined,
  onViewChange: (view: ReadingView) => void,
  pendingSceneFragment: React.RefObject<PendingSceneFragment | undefined>,
  saveLocation: () => void,
  setNotesIdentity: (identity: string | undefined) => void,
  setReadingToolTab: (tab: "supplementary") => void,
  toolsScrollRef: React.RefObject<HTMLDivElement | null>,
  topology: ReadingSceneTopology,
  view: ReadingView,
]) {
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
    const queueFragment = () => {
      if (!fragment) return;
      pendingSceneFragment.current = {
        fragment,
        owner: destination.owner,
        sceneIdentity: destination.scene.componentIdentity,
        target: destination.target,
      };
    };
    if (destination.scene.presentationRegion === "article") {
      if (destination.scene.componentIdentity === component.identity) {
        if (!fragment) return true;
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
        return true;
      }
      return navigation
        .request({
          cause: "component-transition",
          owner: destination.owner,
          target: destination.target,
        })
        .commitTransition(() => {
          queueFragment();
          changeArticleScene(
            destination.scene.componentIdentity,
            fromDestination.owner === "publisher-note",
          );
        });
    }
    const notesAlreadyOpen =
      notesIdentity === destination.scene.componentIdentity;
    return navigation
      .request({
        cause: "publisher-note-navigation",
        owner: destination.owner,
        target: destination.target,
      })
      .commitTransition(() => {
        saveLocation();
        setReadingToolTab("supplementary");
        if (view === "bibliography") onViewChange("article");
        setNotesIdentity(destination.scene.componentIdentity);
        if (!fragment) return;
        if (!notesAlreadyOpen) {
          queueFragment();
          return;
        }
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
        );
      });
  };
}
