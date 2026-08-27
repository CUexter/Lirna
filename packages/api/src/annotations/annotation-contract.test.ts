import { describe, expect, test } from "bun:test";

import {
  InvalidAnnotationError,
  validateAnnotationBody,
} from "./annotation-contract";

describe("Annotation invariants", () => {
  test("defines highlights by absent bodies and notes by present bodies", () => {
    expect(() => validateAnnotationBody("highlight", null)).not.toThrow();
    expect(() => validateAnnotationBody("note", "Remember this")).not.toThrow();
    expect(() => validateAnnotationBody("note", null)).toThrow(
      InvalidAnnotationError,
    );
    expect(() => validateAnnotationBody("highlight", "Unexpected")).toThrow(
      InvalidAnnotationError,
    );
  });
});
