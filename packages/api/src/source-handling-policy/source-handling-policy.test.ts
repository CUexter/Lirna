import { describe, expect, test } from "bun:test";

import {
  decideCitationInference,
  decideContentProcessing,
  decideOfflineRetention,
  mostRestrictiveSensitivity,
  rightsBases,
  rightsBasisSchema,
  sensitivityLevelSchema,
  sensitivityLevels,
} from "./source-handling-policy";

const citationInference = {
  activity: "citation-candidate-inference",
  endpointClass: "ordinary-cloud",
} as const;

describe("Source handling policy", () => {
  test("owns and parses the complete policy vocabulary", () => {
    expect(rightsBases).toEqual([
      "owned",
      "lawfully-acquired",
      "publicly-accessible",
      "explicitly-licensed",
      "reference-only",
      "inaccessible",
    ]);
    expect(sensitivityLevels).toEqual([
      "ordinary-cloud",
      "restricted-cloud",
      "local-only",
    ]);

    for (const value of rightsBases) {
      expect(rightsBasisSchema.parse(value)).toBe(value);
    }
    for (const value of sensitivityLevels) {
      expect(sensitivityLevelSchema.parse(value)).toBe(value);
    }
    expect(rightsBasisSchema.safeParse("unknown").success).toBeFalse();
    expect(sensitivityLevelSchema.safeParse("unknown").success).toBeFalse();
  });

  test("explains every restriction on ordinary-cloud Citation inference", () => {
    expect(
      decideCitationInference(
        {
          rightsBasis: "publicly-accessible",
          sensitivityLevel: "ordinary-cloud",
        },
        "ordinary-cloud",
      ),
    ).toEqual({
      allowed: true,
      request: citationInference,
      reason: "eligible",
    });

    expect(
      decideCitationInference(
        { rightsBasis: "reference-only", sensitivityLevel: "local-only" },
        "ordinary-cloud",
      ),
    ).toEqual({
      allowed: false,
      request: citationInference,
      reasons: ["rights-reference-only", "requires-local-processing"],
    });
    expect(
      decideCitationInference(
        {
          rightsBasis: "inaccessible",
          sensitivityLevel: "restricted-cloud",
        },
        "ordinary-cloud",
      ),
    ).toEqual({
      allowed: false,
      request: citationInference,
      reasons: ["content-inaccessible", "requires-restricted-cloud"],
    });
  });

  test("allows only endpoint classes that meet the sensitivity level", () => {
    const policy = {
      rightsBasis: "owned",
      sensitivityLevel: "restricted-cloud",
    } as const;

    expect(
      decideCitationInference(policy, "restricted-cloud").allowed,
    ).toBeTrue();
    expect(decideCitationInference(policy, "local").allowed).toBeTrue();
  });

  test("applies the same policy before general content processing", () => {
    expect(
      decideContentProcessing(
        { rightsBasis: "owned", sensitivityLevel: "local-only" },
        "ordinary-cloud",
      ),
    ).toEqual({
      allowed: false,
      reasons: ["requires-local-processing"],
    });
    expect(
      decideContentProcessing(
        { rightsBasis: "publicly-accessible", sensitivityLevel: "local-only" },
        "local",
      ),
    ).toEqual({ allowed: true, reason: "eligible" });
  });

  test("permits local Offline working-set retention only for retainable rights", () => {
    expect(
      decideOfflineRetention({
        rightsBasis: "owned",
        sensitivityLevel: "local-only",
      }),
    ).toEqual({ allowed: true, reason: "eligible" });
    expect(
      decideOfflineRetention({
        rightsBasis: "reference-only",
        sensitivityLevel: "ordinary-cloud",
      }),
    ).toEqual({ allowed: false, reasons: ["rights-reference-only"] });
    expect(
      decideOfflineRetention({
        rightsBasis: "inaccessible",
        sensitivityLevel: "restricted-cloud",
      }),
    ).toEqual({ allowed: false, reasons: ["content-inaccessible"] });
  });

  test("combines inputs at their most restrictive sensitivity level", () => {
    expect(mostRestrictiveSensitivity(["ordinary-cloud"])).toBe(
      "ordinary-cloud",
    );
    expect(
      mostRestrictiveSensitivity(["restricted-cloud", "ordinary-cloud"]),
    ).toBe("restricted-cloud");
    expect(
      mostRestrictiveSensitivity([
        "ordinary-cloud",
        "local-only",
        "restricted-cloud",
      ]),
    ).toBe("local-only");
  });
});
