import { expect, test } from "bun:test";
import { createReadingNavigation } from "./reading-navigation";
import {
  createReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import { readingFixture } from "./reading-test-fixtures";
import {
  createWorkspaceSceneTransitions,
  type WorkspaceSceneTransition,
} from "./workspace-scene-transitions";
import type { PendingSceneFragment } from "./workspace-types";

type TransitionDependencies = Parameters<
  typeof createWorkspaceSceneTransitions
>[0];

function createTransitionHarness(
  overrides: Partial<TransitionDependencies> = {},
) {
  const reading = readingFixture();
  const topology = createReadingSceneTopology(reading);
  return {
    reading,
    topology,
    transitions: createWorkspaceSceneTransitions({
      clearPendingTargets: () => undefined,
      componentIdentity: reading.mainComponent.identity,
      hasUnsavedAnnotation: () => false,
      navigation: createReadingNavigation(),
      onAnnotationDiscardRequired: () => undefined,
      onComponentChange: () => undefined,
      onUnavailable: () => undefined,
      onViewChange: () => undefined,
      openBibliography: () => undefined,
      requestCitationScroll: () => undefined,
      returnToCitation: () => undefined,
      saveLocation: () => undefined,
      setEditingAnnotationId: () => undefined,
      setNotesIdentity: () => undefined,
      setPendingCitation: () => undefined,
      setPendingSceneFragment: () => undefined,
      setReadingToolTab: () => undefined,
      setSelectedReference: () => undefined,
      topology,
      view: "article",
      ...overrides,
    }),
  };
}

function otherArticleTransition(
  topology: ReturnType<typeof createReadingSceneTopology>,
): WorkspaceSceneTransition & { kind: "scene" } {
  const target = topology.scenes.find(
    (scene) =>
      scene.presentationRegion === "article" &&
      scene.identity !== topology.mainSceneIdentity,
  );
  if (!target) throw new Error("Article Source component fixture is missing");
  return {
    cause: "component-transition",
    destination: resolveReadingSceneDestination(topology, {
      sceneIdentity: target.identity,
      target: "component",
    }),
    kind: "scene",
    originOwner: "article",
    targetDescription: target.identity,
  };
}

test("saves and clears the departing scene before selecting a Source component", () => {
  const calls: string[] = [];
  const { topology, transitions } = createTransitionHarness({
    onComponentChange: (identity) => calls.push(`select:${identity}`),
    saveLocation: () => calls.push("save"),
    setEditingAnnotationId: (identity) =>
      calls.push(`annotation:${identity ?? "closed"}`),
    setNotesIdentity: (identity) => calls.push(`notes:${identity ?? "closed"}`),
    setSelectedReference: (reference) =>
      calls.push(`reference:${reference?.targetId ?? "closed"}`),
  });
  const transition = otherArticleTransition(topology);

  transitions.request(transition);

  expect(calls).toEqual([
    "save",
    "annotation:closed",
    "reference:closed",
    "notes:closed",
    `select:${transition.destination.movement === "move" ? transition.destination.scene.componentIdentity : "missing"}`,
  ]);
});

test("reports an unavailable destination without changing the Reading workspace", () => {
  const calls: string[] = [];
  const { transitions } = createTransitionHarness({
    clearPendingTargets: () => calls.push("clear-pending"),
    onAnnotationDiscardRequired: () => calls.push("confirm"),
    onComponentChange: () => calls.push("select"),
    onUnavailable: (unavailable) =>
      calls.push(
        unavailable
          ? `unavailable:${unavailable.target}:${unavailable.reason}`
          : "clear-feedback",
      ),
    onViewChange: () => calls.push("view"),
    openBibliography: () => calls.push("bibliography"),
    requestCitationScroll: () => calls.push("citation-scroll"),
    returnToCitation: () => calls.push("return"),
    saveLocation: () => calls.push("save"),
    setEditingAnnotationId: () => calls.push("annotation"),
    setNotesIdentity: () => calls.push("notes"),
    setPendingCitation: () => calls.push("pending-citation"),
    setPendingSceneFragment: () => calls.push("pending-fragment"),
    setReadingToolTab: () => calls.push("tab"),
    setSelectedReference: () => calls.push("reference"),
  });

  transitions.request({
    cause: "component-transition",
    destination: { movement: "none", reason: "unknown-scene" },
    kind: "scene",
    originOwner: "article",
    targetDescription: "Missing supplement",
  });

  expect(calls).toEqual(["unavailable:Missing supplement:unknown-scene"]);
});

test("waits for Annotation confirmation before changing the scene", () => {
  const calls: string[] = [];
  let continueTransition: () => void = () => undefined;
  const { topology, transitions } = createTransitionHarness({
    hasUnsavedAnnotation: () => true,
    onAnnotationDiscardRequired: (continueAfterConfirmation) => {
      calls.push("confirm");
      continueTransition = continueAfterConfirmation;
    },
    onComponentChange: () => calls.push("select"),
    saveLocation: () => calls.push("save"),
    setEditingAnnotationId: () => calls.push("annotation"),
    setNotesIdentity: () => calls.push("notes"),
    setSelectedReference: () => calls.push("reference"),
  });

  transitions.request(otherArticleTransition(topology));
  expect(calls).toEqual(["confirm"]);

  continueTransition();
  expect(calls).toEqual([
    "confirm",
    "save",
    "annotation",
    "reference",
    "notes",
    "select",
  ]);
});

test("orders Bibliography consequences behind the transition seam", () => {
  const calls: string[] = [];
  const { transitions } = createTransitionHarness({
    onUnavailable: (unavailable) =>
      calls.push(unavailable ? "unavailable" : "clear-feedback"),
    openBibliography: (entryId) => calls.push(`open:${entryId}`),
    requestCitationScroll: () => calls.push("citation-scroll"),
    saveLocation: () => calls.push("save"),
    setNotesIdentity: () => calls.push("notes:closed"),
    setReadingToolTab: (tab) => calls.push(`tab:${tab}`),
    setSelectedReference: () => calls.push("reference:closed"),
  });

  transitions.request({ entryId: "entry-one", kind: "bibliography" });

  expect(calls).toEqual([
    "clear-feedback",
    "save",
    "notes:closed",
    "reference:closed",
    "tab:bibliography",
    "citation-scroll",
    "open:entry-one",
  ]);
});

test("reports article movement only after a delayed transition commits", () => {
  const calls: string[] = [];
  let continueTransition: () => void = () => undefined;
  const { transitions } = createTransitionHarness({
    hasUnsavedAnnotation: () => true,
    onAnnotationDiscardRequired: (commit) => {
      calls.push("confirm");
      continueTransition = commit;
    },
    onViewChange: (view) => calls.push(`view:${view}`),
  });

  transitions.request({ kind: "article" }, () => calls.push("committed"));
  expect(calls).toEqual(["confirm"]);

  continueTransition();
  expect(calls).toEqual(["confirm", "view:article", "committed"]);
});

test("replaces an older pending passage for the same scroll owner", () => {
  let pending: PendingSceneFragment | undefined = {
    fragment: "old-passage",
    owner: "article",
    sceneIdentity: "old-scene",
    target: "fragment:old-passage",
  };
  const { topology, transitions } = createTransitionHarness({
    clearPendingTargets: (owner) => {
      if (pending?.owner === owner) pending = undefined;
    },
    setPendingSceneFragment: (next) => {
      pending = next;
    },
  });
  const transition = otherArticleTransition(topology);
  if (transition.destination.movement === "none") {
    throw new Error("Article Source component destination is missing");
  }
  const passage = {
    fragment: "new-passage",
    owner: transition.destination.owner,
    sceneIdentity: transition.destination.scene.componentIdentity,
    target: "fragment:new-passage",
  };

  transitions.request({ ...transition, pendingFragment: passage });
  expect(pending).toEqual(passage);

  transitions.request(transition);
  expect(pending).toBeUndefined();
});

test("queues a specific Citation before selecting its Source component", () => {
  const calls: string[] = [];
  const { topology, transitions } = createTransitionHarness({
    clearPendingTargets: (owner) => calls.push(`clear:${owner}`),
    onComponentChange: (identity) => calls.push(`select:${identity}`),
    saveLocation: () => calls.push("save"),
    setPendingCitation: (pending) =>
      calls.push(`pending:${pending.componentIdentity}:${pending.mentionId}`),
  });
  const target = otherArticleTransition(topology);
  if (target.destination.movement === "none") {
    throw new Error("Article Source component destination is missing");
  }

  transitions.request({
    kind: "citation",
    mentionId: "citation-one",
    targetComponentIdentity: target.destination.scene.componentIdentity,
  });

  expect(calls).toEqual([
    "save",
    "clear:article",
    `pending:${target.destination.scene.componentIdentity}:citation-one`,
    `select:${target.destination.scene.componentIdentity}`,
  ]);
});

test("keeps publisher-authored notes open when movement starts there", () => {
  const calls: string[] = [];
  const { topology, transitions } = createTransitionHarness({
    onComponentChange: () => calls.push("select"),
    setNotesIdentity: () => calls.push("close-notes"),
  });

  transitions.request({
    ...otherArticleTransition(topology),
    originOwner: "publisher-note",
  });

  expect(calls).toEqual(["select"]);
});

test("saves before activating a named passage through its browser adapter", () => {
  const calls: string[] = [];
  const { topology, transitions } = createTransitionHarness({
    clearPendingTargets: (owner) => calls.push(`clear:${owner}`),
    onUnavailable: (unavailable) =>
      calls.push(unavailable ? "unavailable" : "clear-feedback"),
    saveLocation: () => calls.push("save"),
  });
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: topology.mainSceneIdentity,
    target: "fragment:notation",
  });
  if (destination.movement === "none") {
    throw new Error("Named passage fixture is missing");
  }

  transitions.request({
    activate: () => calls.push("activate"),
    destination,
    kind: "passage",
  });

  expect(calls).toEqual([
    "clear-feedback",
    "save",
    "clear:article",
    "activate",
  ]);
});

test("opens a Reference through the transition seam", () => {
  const calls: string[] = [];
  const reference = {
    componentIdentity: "article",
    context: "Nearby Source text",
    label: "§1",
    targetId: "section-one",
    title: "Section one",
  };
  const { transitions } = createTransitionHarness({
    saveLocation: () => calls.push("save"),
    setReadingToolTab: (tab) => calls.push(`tab:${tab}`),
    setSelectedReference: (selected) =>
      calls.push(`reference:${selected?.targetId}`),
  });

  transitions.request({ kind: "reference", reference });

  expect(calls).toEqual(["save", "reference:section-one", "tab:supplementary"]);
});
