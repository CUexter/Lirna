import type { ReadingNavigationCause } from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingSceneDestinationResult,
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import type { ReadingToolTab } from "./reading-tools-panel";
import type { ReadingReference } from "./references";
import type {
  PendingCitation,
  PendingSceneFragment,
  ReadingView,
} from "./workspace-types";

export interface WorkspaceTransitionUnavailable {
  reason:
    | Extract<ReadingSceneDestinationResult, { movement: "none" }>["reason"]
    | "target-unavailable";
  target: string;
}

export type WorkspaceSceneTransition =
  | {
      cause: Extract<
        ReadingNavigationCause,
        "component-transition" | "publisher-note-navigation"
      >;
      destination: ReadingSceneDestinationResult;
      kind: "scene";
      originOwner: "article" | "publisher-note";
      pendingCitation?: PendingCitation;
      pendingFragment?: PendingSceneFragment;
      targetDescription: string;
    }
  | { kind: "bibliography"; entryId?: string }
  | { kind: "citation"; mentionId: string; targetComponentIdentity: string }
  | {
      identity: string;
      kind: "component";
      originOwner: "article" | "publisher-note";
    }
  | { kind: "reference"; reference: ReadingReference }
  | {
      activate: () => void;
      destination: Extract<ReadingSceneDestinationResult, { movement: "move" }>;
      kind: "passage";
    }
  | { kind: "tool"; tab: ReadingToolTab }
  | {
      kind: "unavailable";
      reason: WorkspaceTransitionUnavailable["reason"];
      targetDescription: string;
    };

interface WorkspaceSceneTransitionDependencies {
  clearPendingTargets: (owner: "article" | "publisher-note") => void;
  componentIdentity: string;
  hasUnsavedAnnotation: () => boolean;
  navigation: ReadingNavigation;
  onAnnotationDiscardRequired: (continueTransition: () => void) => void;
  onComponentChange: (identity: string) => void;
  onUnavailable: (
    unavailable: WorkspaceTransitionUnavailable | undefined,
  ) => void;
  onViewChange: (view: ReadingView) => void;
  openBibliography: (entryId?: string) => void;
  requestCitationScroll: () => void;
  returnToCitation: (mentionId: string) => void;
  saveLocation: () => void;
  setEditingAnnotationId: (identity: string | undefined) => void;
  setNotesIdentity: (identity: string | undefined) => void;
  setPendingCitation: (pending: PendingCitation) => void;
  setPendingSceneFragment: (pending: PendingSceneFragment) => void;
  setReadingToolTab: (tab: ReadingToolTab) => void;
  setSelectedReference: (reference: ReadingReference | undefined) => void;
  topology: ReadingSceneTopology;
  view: ReadingView;
}

type ResolvedWorkspaceTransition =
  | Exclude<
      WorkspaceSceneTransition,
      { kind: "citation" } | { kind: "component" }
    >
  | { kind: "current-citation"; mentionId: string; owner: "article" };

export function createWorkspaceSceneTransitions(
  dependencies: WorkspaceSceneTransitionDependencies,
) {
  const request = (transition: WorkspaceSceneTransition) => {
    const resolved = resolveWorkspaceTransition(transition, dependencies);
    const unavailable = transitionUnavailable(resolved);
    if (unavailable) {
      dependencies.onUnavailable({
        reason: unavailable.reason,
        target: unavailable.targetDescription,
      });
      return true;
    }
    const commit = () => {
      dependencies.onUnavailable(undefined);
      commitWorkspaceTransition(resolved, dependencies);
    };
    if (leavesAnnotation(resolved) && dependencies.hasUnsavedAnnotation()) {
      dependencies.onAnnotationDiscardRequired(commit);
    } else {
      commit();
    }
    return true;
  };
  return { request };
}

function resolveWorkspaceTransition(
  transition: WorkspaceSceneTransition,
  dependencies: WorkspaceSceneTransitionDependencies,
): ResolvedWorkspaceTransition {
  if (transition.kind === "component") {
    const destination = resolveReadingSceneDestination(dependencies.topology, {
      sceneIdentity: transition.identity,
      target: "component",
    });
    return {
      cause:
        destination.movement === "move" &&
        destination.scene.presentationRegion === "reading-tools:supplementary"
          ? "publisher-note-navigation"
          : "component-transition",
      destination,
      kind: "scene",
      originOwner: transition.originOwner,
      targetDescription: transition.identity,
    };
  }
  if (transition.kind !== "citation") return transition;
  const destination = resolveReadingSceneDestination(dependencies.topology, {
    sceneIdentity: transition.targetComponentIdentity,
    target: `citation:${transition.mentionId}`,
  });
  if (destination.movement === "none") {
    return {
      kind: "unavailable",
      reason: destination.reason,
      targetDescription: transition.targetComponentIdentity,
    };
  }
  if (
    destination.scene.presentationRegion === "article" &&
    destination.scene.componentIdentity === dependencies.componentIdentity
  ) {
    return {
      kind: "current-citation",
      mentionId: transition.mentionId,
      owner: "article",
    };
  }
  return {
    cause:
      destination.scene.presentationRegion === "reading-tools:supplementary"
        ? "publisher-note-navigation"
        : "component-transition",
    destination,
    kind: "scene",
    originOwner: "article",
    pendingCitation: {
      componentIdentity: transition.targetComponentIdentity,
      mentionId: transition.mentionId,
      owner: destination.owner,
    },
    targetDescription: transition.targetComponentIdentity,
  };
}

function transitionUnavailable(transition: ResolvedWorkspaceTransition) {
  if (transition.kind === "unavailable") return transition;
  if (
    transition.kind === "scene" &&
    transition.destination.movement === "none"
  ) {
    return {
      reason: transition.destination.reason,
      targetDescription: transition.targetDescription,
    };
  }
}

function leavesAnnotation(transition: ResolvedWorkspaceTransition) {
  return (
    transition.kind === "bibliography" ||
    (transition.kind === "tool" && transition.tab === "bibliography") ||
    (transition.kind === "scene" &&
      transition.destination.movement === "move" &&
      transition.destination.scene.presentationRegion === "article")
  );
}

function commitWorkspaceTransition(
  transition: ResolvedWorkspaceTransition,
  dependencies: WorkspaceSceneTransitionDependencies,
) {
  if (transition.kind === "current-citation") {
    dependencies.clearPendingTargets(transition.owner);
    dependencies.returnToCitation(transition.mentionId);
    dependencies.onViewChange("article");
  } else if (transition.kind === "reference") {
    dependencies.saveLocation();
    dependencies.setSelectedReference(transition.reference);
    dependencies.setReadingToolTab("supplementary");
    if (dependencies.view === "bibliography") {
      dependencies.onViewChange("article");
    }
  } else if (transition.kind === "passage") {
    dependencies.saveLocation();
    dependencies.clearPendingTargets(transition.destination.owner);
    transition.activate();
  } else if (transition.kind === "bibliography") {
    dependencies.saveLocation();
    dependencies.setNotesIdentity(undefined);
    dependencies.setSelectedReference(undefined);
    dependencies.setReadingToolTab("bibliography");
    dependencies.requestCitationScroll();
    dependencies.openBibliography(transition.entryId);
  } else if (transition.kind === "tool") {
    commitToolTransition(transition.tab, dependencies);
  } else if (
    transition.kind === "scene" &&
    transition.destination.movement === "move"
  ) {
    commitSceneTransition(transition, transition.destination, dependencies);
  }
}

function commitToolTransition(
  tab: ReadingToolTab,
  dependencies: WorkspaceSceneTransitionDependencies,
) {
  if (tab === "bibliography" && dependencies.view !== "bibliography") {
    dependencies.saveLocation();
    dependencies.setReadingToolTab(tab);
    dependencies.onViewChange("bibliography");
  } else if (tab !== "bibliography" && dependencies.view === "bibliography") {
    dependencies.setReadingToolTab(tab);
    dependencies.onViewChange("article");
  } else {
    dependencies.setReadingToolTab(tab);
  }
}

function commitSceneTransition(
  transition: Extract<ResolvedWorkspaceTransition, { kind: "scene" }>,
  destination: Extract<ReadingSceneDestinationResult, { movement: "move" }>,
  dependencies: WorkspaceSceneTransitionDependencies,
) {
  dependencies.navigation
    .request({
      cause: transition.cause,
      owner: destination.owner,
      target: destination.target,
    })
    .commitTransition(() => {
      dependencies.saveLocation();
      dependencies.clearPendingTargets(destination.owner);
      if (transition.pendingCitation) {
        dependencies.setPendingCitation(transition.pendingCitation);
      }
      if (transition.pendingFragment) {
        dependencies.setPendingSceneFragment(transition.pendingFragment);
      }
      if (destination.scene.presentationRegion === "article") {
        dependencies.setEditingAnnotationId(undefined);
        dependencies.setSelectedReference(undefined);
        if (transition.originOwner !== "publisher-note") {
          dependencies.setNotesIdentity(undefined);
        }
        dependencies.onComponentChange(destination.scene.componentIdentity);
        return;
      }
      dependencies.setReadingToolTab("supplementary");
      dependencies.setSelectedReference(undefined);
      if (dependencies.view === "bibliography") {
        dependencies.onViewChange("article");
      }
      dependencies.setNotesIdentity(destination.scene.componentIdentity);
    });
}
