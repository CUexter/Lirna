import { describe, expect, test } from "bun:test";

import {
  InvalidCitationResolutionError,
  validateCitationResolutionMetadata,
} from "./citation-resolution-contract";

describe("Citation resolution invariants", () => {
  test("keeps manual decisions free of inference metadata", () => {
    expect(() =>
      validateCitationResolutionMetadata({ method: "manual" }),
    ).not.toThrow();
    expect(() =>
      validateCitationResolutionMetadata({
        method: "manual",
        confidence: 0.8,
      }),
    ).toThrow(InvalidCitationResolutionError);
  });

  test("requires bounded confidence and reasoning for inferred decisions", () => {
    expect(() =>
      validateCitationResolutionMetadata({
        method: "inferred",
        confidence: 0.8,
        reasoning: "The authored year and title align.",
      }),
    ).not.toThrow();
    expect(() =>
      validateCitationResolutionMetadata({
        method: "inferred",
        confidence: 1.1,
        reasoning: "Out of range.",
      }),
    ).toThrow(InvalidCitationResolutionError);
    expect(() =>
      validateCitationResolutionMetadata({
        method: "inferred",
        confidence: 0.8,
        reasoning: " ",
      }),
    ).toThrow(InvalidCitationResolutionError);
  });
});
