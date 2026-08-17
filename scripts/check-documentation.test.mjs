import { describe, expect, test } from "bun:test";

import { checkDocumentation } from "./check-documentation.mjs";

const fixtureRoot = new URL(
  "./fixtures/documentation-quality/",
  import.meta.url,
).pathname;

describe("documentation quality fixtures", () => {
  test("accepts valid links, commands, and repository paths", async () => {
    expect(await checkDocumentation(`${fixtureRoot}valid`)).toEqual([]);
  });

  test("reports broken links, missing commands, and obsolete paths", async () => {
    const violations = await checkDocumentation(`${fixtureRoot}invalid`);
    expect(violations).toEqual([
      "docs/guide.md: broken internal link ../missing.md",
      "docs/guide.md: broken internal link #missing-section",
      "docs/guide.md: missing root command bun run missing",
      "docs/guide.md: non-Bun command npx fixture-cli",
      "docs/guide.md: obsolete repository path client/src/routes",
    ]);
  });
});
