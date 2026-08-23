import { expect, test } from "bun:test";

import { readingFixture } from "../../routes/sources/-reading-test-fixtures";
import { authoredTarget } from "./authored-navigation";

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
