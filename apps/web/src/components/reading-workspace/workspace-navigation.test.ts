import { expect, test } from "bun:test";

import { readingFixture } from "../../routes/sources/-reading-test-fixtures";
import { createReadingSceneTopology } from "./reading-scene-topology";
import { createReferenceIndex } from "./references";
import { navigateAuthoredLink } from "./workspace-navigation";

test("does not route an authored link with a missing destination fragment", () => {
  const reading = readingFixture();
  const article = reading.components[0];
  if (!article) throw new Error("Article fixture is missing");
  let navigated = false;

  const handled = navigateAuthoredLink({
    from: article,
    href: "notes.html#missing",
    label: "Missing note",
    navigateScene: () => {
      navigated = true;
      return true;
    },
    openReference: () => undefined,
    reading,
    referenceIndex: createReferenceIndex(article),
    setSelectedReference: () => undefined,
    topology: createReadingSceneTopology(reading),
  });

  expect(handled).toBe(true);
  expect(navigated).toBe(false);
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
      openReference: () => undefined,
      reading,
      referenceIndex: createReferenceIndex(article),
      setSelectedReference: () => undefined,
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
      openReference: () => undefined,
      reading,
      referenceIndex: createReferenceIndex(article),
      setSelectedReference: () => undefined,
      topology: createReadingSceneTopology(reading),
    }),
  ).toBe(false);
});
