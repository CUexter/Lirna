import { describe, expect, test } from "bun:test";
import { isMissingPathError } from "./verify-dependency-assessments.ts";

describe("isMissingPathError", () => {
  test.each([
    "fatal: path 'package.json' does not exist in 'HEAD'",
    "fatal: path 'package.json' exists on disk, but not in 'HEAD'",
  ])("recognizes Git missing-path output: %s", (stderr) => {
    expect(isMissingPathError({ code: 128, stderr }, "package.json")).toBe(
      true,
    );
  });

  test("preserves unrelated Git failures", () => {
    expect(
      isMissingPathError(
        { code: 128, stderr: "fatal: invalid object name 'missing'" },
        "package.json",
      ),
    ).toBe(false);
  });
});
