import { expect, test } from "bun:test";
import { createReferenceIndex } from "../bibliography/components/References";
import { readingFixture } from "../test-support/fixtures";
import {
  authoredTarget,
  componentHasFragment,
  createWorkspaceAuthoredNavigation,
} from "./authored";
import { createReadingNavigation } from "./model";
import type { WorkspaceSceneTransition } from "./sceneTransitions";

test("asks before leaving the Reading workspace for an uncaptured publication", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  let pendingLeave: { href: string; label: string } | undefined;
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: (link) => {
      pendingLeave = link;
    },
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: () => true,
    toolsScrollRef: { current: null },
  });

  const handled = authoredNavigation.open(
    article,
    "https://example.com/publication",
    "Related publication",
  );

  expect(handled).toBe(true);
  expect(pendingLeave).toEqual({
    href: "https://example.com/publication",
    label: "Related publication",
  });
});

test("reports a missing captured passage through the transition module", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  const transitions: WorkspaceSceneTransition[] = [];
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: (transition) => {
      transitions.push(transition);
      return true;
    },
    toolsScrollRef: { current: null },
  });

  expect(
    authoredNavigation.open(article, "notes.html#missing", "Missing"),
  ).toBe(true);
  expect(transitions).toEqual([
    {
      kind: "unavailable",
      reason: "target-unavailable",
      targetDescription: "Notes passage missing",
    },
  ]);
});

test("requests current publisher-authored passage movement without resolving topology", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  const transitions: WorkspaceSceneTransition[] = [];
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: (transition) => {
      transitions.push(transition);
      return true;
    },
    toolsScrollRef: { current: null },
  });

  expect(
    authoredNavigation.open(
      article,
      "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
      "Proposition 1",
    ),
  ).toBe(true);
  expect(transitions).toHaveLength(1);
  expect(transitions[0]).toMatchObject({
    fragment: "proposition-1",
    kind: "authored-passage",
    sceneIdentity: "article",
    targetDescription: "Article passage proposition-1",
  });
});

test("requests publisher-authored movement to another captured Source component", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  const transitions: WorkspaceSceneTransition[] = [];
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: (transition) => {
      transitions.push(transition);
      return true;
    },
    toolsScrollRef: { current: null },
  });

  expect(authoredNavigation.open(article, "notes.html#1", "Note 1")).toBe(true);
  expect(transitions).toEqual([
    {
      cause: "publisher-note-navigation",
      fragment: "1",
      kind: "authored-scene",
      originOwner: "article",
      sceneIdentity: "notes",
      targetDescription: "Notes",
    },
  ]);
});

test("opens a publisher-authored Reference through the transition module", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  const transitions: WorkspaceSceneTransition[] = [];
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: (transition) => {
      transitions.push(transition);
      return true;
    },
    toolsScrollRef: { current: null },
  });

  expect(authoredNavigation.open(article, "#Poss", "(1)")).toBe(true);
  expect(transitions).toHaveLength(1);
  expect(transitions[0]).toMatchObject({
    kind: "reference",
    reference: { targetId: "reading-reference-number-1" },
  });
});

test("reports ambiguous captured Source component aliases as unavailable", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (component) => component.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  reading.components.push({ ...article, identity: "duplicate-article" });
  const transitions: WorkspaceSceneTransition[] = [];
  let leaveRequested = false;
  const authoredNavigation = createWorkspaceAuthoredNavigation({
    articleRef: { current: null },
    component: article,
    navigation: createReadingNavigation(),
    notesIdentity: undefined,
    onLeaveReadingWorkspace: () => {
      leaveRequested = true;
    },
    reading,
    referenceIndex: createReferenceIndex(article),
    requestTransition: (transition) => {
      transitions.push(transition);
      return true;
    },
    toolsScrollRef: { current: null },
  });

  expect(authoredNavigation.open(article, "#Poss", "Possibility")).toBe(true);
  expect(leaveRequested).toBe(false);
  expect(transitions).toEqual([
    {
      kind: "unavailable",
      reason: "target-unavailable",
      targetDescription: "Possibility",
    },
  ]);
});

test("resolves absolute same-document links across HTML URL aliases", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (item) => item.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");

  const target = authoredTarget(
    reading,
    article,
    "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
  );

  expect(target?.component.identity).toBe("article");
  expect(target?.fragment).toBe("proposition-1");
});

test("resolves absolute links from notes back to the article", () => {
  const reading = readingFixture();
  const notes = reading.components.find((item) => item.identity === "notes");
  if (!notes) throw new Error("Notes fixture is missing");

  const target = authoredTarget(
    reading,
    notes,
    "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
  );

  expect(target?.component.identity).toBe("article");
  expect(target?.fragment).toBe("proposition-1");
});

test("rejects links whose component URL is ambiguous", () => {
  const reading = readingFixture();
  const article = reading.components.find(
    (item) => item.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");
  reading.components.push({ ...article, identity: "duplicate-article" });

  expect(authoredTarget(reading, article, "#Poss")).toBeUndefined();
});

test("checks rendered fragment targets before navigating", () => {
  const article = readingFixture().components.find(
    (item) => item.identity === "article",
  );
  if (!article) throw new Error("Article fixture is missing");

  expect(componentHasFragment(article, "Poss")).toBe(true);
  expect(componentHasFragment(article, "missing-target")).toBe(false);
});
