import { describe, expect, test } from "bun:test";

import { cn } from "./utils";

describe("cn", () => {
  test("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  test("joins multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("filters falsy values", () => {
    expect(cn("a", undefined, null, false, "", "b")).toBe("a b");
  });

  test("respects conditional objects and arrays via clsx", () => {
    expect(cn("a", { b: true, c: false }, ["d", { e: true, f: false }])).toBe(
      "a b d e",
    );
  });

  test("merges conflicting tailwind classes with the last winner", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("keeps non-conflicting tailwind classes", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  test("merges conflicts while preserving conditionals", () => {
    const active = true;
    expect(cn("px-2", active && "py-1", "px-4")).toBe("py-1 px-4");
  });

  test("deduplicates identical classes", () => {
    expect(cn("px-2", "px-2")).toBe("px-2");
  });
});
