import { expect, test } from "bun:test";
import { authoredTarget } from "./authored-navigation";
import { createReadingSceneTopology } from "./reading-scene-topology";
import { readingFixture } from "./reading-test-fixtures";
import { createReferenceIndex } from "./references";
import { navigateAuthoredLink } from "./workspace-navigation";

test("does not route an authored link with a missing destination fragment", () => {
  const reading = readingFixture();
  const article = reading.components[0];
  if (!article) throw new Error("Article fixture is missing");
  let navigated = false;
  let unavailable = "";

  const handled = navigateAuthoredLink({
    from: article,
    href: "notes.html#missing",
    label: "Missing note",
    navigateScene: () => {
      navigated = true;
      return true;
    },
    onUnavailable: (target) => {
      unavailable = target;
    },
    openReference: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    topology: createReadingSceneTopology(reading),
  });

  expect(handled).toBe(true);
  expect(navigated).toBe(false);
  expect(unavailable).toContain("missing");
});

test("handles an authored link whose scene is unavailable", () => {
  const reading = readingFixture();
  const article = reading.components[0];
  if (!article) throw new Error("Article fixture is missing");
  const topology = createReadingSceneTopology(reading);
  const target = authoredTarget(reading, article, "notes.html#1");
  if (!target) throw new Error("Authored destination fixture is missing");
  topology.unavailableSceneIdentities = [target.component.identity];
  let unavailable = "";

  const handled = navigateAuthoredLink({
    from: article,
    href: "notes.html#1",
    label: "Notes",
    navigateScene: () => false,
    onUnavailable: (target) => {
      unavailable = target;
    },
    openReference: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    topology,
  });

  expect(handled).toBe(true);
  expect(unavailable).not.toBe("");
});

test("leaves external links to the browser", () => {
  const reading = readingFixture();
  const article = reading.components[0];
  if (!article) throw new Error("Article fixture is missing");

  expect(
    navigateAuthoredLink({
      from: article,
      href: "https://example.com/",
      label: "External",
      navigateScene: () => true,
      onUnavailable: () => undefined,
      openReference: () => undefined,
      reading,
      referenceIndex: createReferenceIndex(article),
      topology: createReadingSceneTopology(reading),
    }),
  ).toBe(false);
});

test("leaves uncaptured same-origin links to the browser", () => {
  const reading = readingFixture();
  const article = reading.components[0];
  if (!article) throw new Error("Article fixture is missing");

  expect(
    navigateAuthoredLink({
      from: article,
      href: "https://plato.stanford.edu/entries/uncaptured/",
      label: "Uncaptured",
      navigateScene: () => true,
      onUnavailable: () => undefined,
      openReference: () => undefined,
      reading,
      referenceIndex: createReferenceIndex(article),
      topology: createReadingSceneTopology(reading),
    }),
  ).toBe(false);
});
