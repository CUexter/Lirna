import { describe, expect, test } from "bun:test";

import {
  isEligibleSource,
  promoteCoveredSources,
  sourceBaselineViolations,
} from "./check-coverage.mjs";

describe("coverage source baseline", () => {
  test("recognizes Bun-instrumented source and excludes policy fixtures", () => {
    expect(isEligibleSource("apps/server/src/runtime.mts")).toBe(true);
    expect(isEligibleSource("packages/api/src/runtime.cjs")).toBe(true);
    expect(isEligibleSource("apps/web/src/components/loader.tsx")).toBe(true);
    expect(isEligibleSource("apps/web/src/config/fixture.ts")).toBe(false);
    expect(
      isEligibleSource(
        "apps/web/src/routes/sources/-admission-test-fixtures.ts",
      ),
    ).toBe(false);
    expect(
      isEligibleSource(
        "apps/web/src/routes/sources/-admission-test-harness.tsx",
      ),
    ).toBe(false);
    expect(
      isEligibleSource(
        "apps/web/src/components/reading-annotations-test-support.ts",
      ),
    ).toBe(false);
    expect(
      isEligibleSource("apps/web/src/test-support/mutation-options.ts"),
    ).toBe(false);
    expect(isEligibleSource("packages/ui/src/components/button.tsx")).toBe(
      true,
    );
    expect(isEligibleSource("packages/ui/src/lib/utils.ts")).toBe(true);
    expect(isEligibleSource("scripts/runtime.mjs")).toBe(false);
  });

  test("accepts unchanged legacy files absent from LCOV", () => {
    expect(
      sourceBaselineViolations({
        absentSources: { "packages/legacy/src/index.ts": "legacy-hash" },
        coveredSources: new Set(["apps/server/src/index.ts"]),
        eligibleSources: [
          "apps/server/src/index.ts",
          "packages/legacy/src/index.ts",
        ],
        hashes: { "packages/legacy/src/index.ts": "legacy-hash" },
      }),
    ).toEqual([]);
  });

  test("rejects new or changed files absent from LCOV", () => {
    expect(
      sourceBaselineViolations({
        absentSources: { "packages/legacy/src/index.ts": "old-hash" },
        coveredSources: new Set(),
        eligibleSources: [
          "apps/new/src/index.ts",
          "packages/legacy/src/index.ts",
        ],
        hashes: {
          "apps/new/src/index.ts": "new-hash",
          "packages/legacy/src/index.ts": "changed-hash",
        },
      }),
    ).toEqual([
      "apps/new/src/index.ts is absent from LCOV and has no reviewed legacy baseline",
      "packages/legacy/src/index.ts changed while absent from LCOV; add coverage or explicitly update the baseline",
    ]);
  });

  test("rejects stale exclusions after a file gains coverage or is deleted", () => {
    expect(
      sourceBaselineViolations({
        absentSources: {
          "apps/covered/src/index.ts": "covered-hash",
          "apps/deleted/src/index.ts": "deleted-hash",
        },
        coveredSources: new Set(["apps/covered/src/index.ts"]),
        eligibleSources: ["apps/covered/src/index.ts"],
        hashes: { "apps/covered/src/index.ts": "covered-hash" },
      }),
    ).toEqual([
      "apps/covered/src/index.ts is covered but remains in the legacy baseline",
      "apps/deleted/src/index.ts is deleted but remains in the legacy baseline",
    ]);
  });

  test("rejects stale exclusions for shadcn components absent from LCOV", () => {
    expect(
      sourceBaselineViolations({
        absentSources: {
          "packages/ui/src/components/button.tsx": "shadcn-hash",
        },
        coveredSources: new Set(),
        eligibleSources: [],
        hashes: {},
      }),
    ).toEqual([
      "packages/ui/src/components/button.tsx is deleted but remains in the legacy baseline",
    ]);
  });

  test("keeps covered shadcn primitives as reviewed exceptions", () => {
    expect(
      sourceBaselineViolations({
        absentSources: {
          "packages/ui/src/components/button.tsx": "shadcn-hash",
        },
        coveredSources: new Set(["packages/ui/src/components/button.tsx"]),
        eligibleSources: ["packages/ui/src/components/button.tsx"],
        hashes: { "packages/ui/src/components/button.tsx": "shadcn-hash" },
      }),
    ).toEqual([]);
  });

  test("promotes only covered eligible sources without changing floors or unrelated hashes", () => {
    const coverage = {
      functionsFound: 20,
      functionsHit: 18,
      linesFound: 100,
      linesHit: 90,
    };
    const promotion = promoteCoveredSources({
      baseline: {
        coverage,
        absentSources: {
          "apps/covered/src/index.ts": "covered-hash",
          "packages/legacy/src/index.ts": "legacy-hash",
        },
      },
      coveredSources: new Set(["apps/covered/src/index.ts"]),
      eligibleSources: [
        "apps/covered/src/index.ts",
        "packages/legacy/src/index.ts",
      ],
      hashes: { "packages/legacy/src/index.ts": "legacy-hash" },
    });

    expect(promotion.promotedSources).toEqual(["apps/covered/src/index.ts"]);
    expect(promotion.baseline.coverage).toEqual(coverage);
    expect(promotion.baseline.absentSources).toEqual({
      "packages/legacy/src/index.ts": "legacy-hash",
    });
    expect(promotion.sourceViolations).toEqual([]);
  });

  test("does not promote covered shadcn primitives", () => {
    const promotion = promoteCoveredSources({
      baseline: {
        coverage: {},
        absentSources: {
          "packages/ui/src/components/button.tsx": "shadcn-hash",
        },
      },
      coveredSources: new Set(["packages/ui/src/components/button.tsx"]),
      eligibleSources: ["packages/ui/src/components/button.tsx"],
      hashes: { "packages/ui/src/components/button.tsx": "shadcn-hash" },
    });

    expect(promotion.promotedSources).toEqual([]);
    expect(promotion.baseline.absentSources).toEqual({
      "packages/ui/src/components/button.tsx": "shadcn-hash",
    });
    expect(promotion.sourceViolations).toEqual([]);
  });

  test("rejects unrelated absent-source changes during promotion", () => {
    const promotion = promoteCoveredSources({
      baseline: {
        coverage: {},
        absentSources: {
          "apps/covered/src/index.ts": "covered-hash",
          "packages/legacy/src/index.ts": "old-hash",
        },
      },
      coveredSources: new Set(["apps/covered/src/index.ts"]),
      eligibleSources: [
        "apps/covered/src/index.ts",
        "packages/legacy/src/index.ts",
        "packages/new/src/index.ts",
      ],
      hashes: {
        "packages/legacy/src/index.ts": "changed-hash",
        "packages/new/src/index.ts": "new-hash",
      },
    });

    expect(promotion.sourceViolations).toEqual([
      "packages/legacy/src/index.ts changed while absent from LCOV; add coverage or explicitly update the baseline",
      "packages/new/src/index.ts is absent from LCOV and has no reviewed legacy baseline",
    ]);
  });

  test("scopes promotion without accepting unrelated absent-source hashes", () => {
    const coverage = {
      functionsFound: 20,
      functionsHit: 18,
      linesFound: 100,
      linesHit: 90,
    };
    const promotion = promoteCoveredSources({
      baseline: {
        coverage,
        absentSources: {
          "apps/covered/src/index.ts": "covered-hash",
          "packages/legacy/src/index.ts": "old-hash",
        },
      },
      coveredSources: new Set(["apps/covered/src/index.ts"]),
      eligibleSources: [
        "apps/covered/src/index.ts",
        "packages/legacy/src/index.ts",
      ],
      hashes: { "packages/legacy/src/index.ts": "changed-hash" },
      sources: ["apps/covered/src/index.ts"],
    });

    expect(promotion.promotedSources).toEqual(["apps/covered/src/index.ts"]);
    expect(promotion.baseline.coverage).toEqual(coverage);
    expect(promotion.baseline.absentSources).toEqual({
      "packages/legacy/src/index.ts": "old-hash",
    });
    expect(promotion.sourceViolations).toEqual([
      "packages/legacy/src/index.ts changed while absent from LCOV; add coverage or explicitly update the baseline",
    ]);
  });

  test("rejects scoped sources that are not covered legacy sources", () => {
    const promotion = promoteCoveredSources({
      baseline: {
        coverage: {},
        absentSources: { "apps/legacy/src/index.ts": "legacy-hash" },
      },
      coveredSources: new Set(),
      eligibleSources: ["apps/legacy/src/index.ts"],
      hashes: { "apps/legacy/src/index.ts": "legacy-hash" },
      sources: ["apps/legacy/src/index.ts", "apps/missing/src/index.ts"],
    });

    expect(promotion.sourceViolations).toEqual([
      "apps/legacy/src/index.ts is absent from LCOV and cannot be promoted",
      "apps/missing/src/index.ts is not an eligible first-party source",
    ]);
  });

  test("does not alter a baseline when no covered legacy sources are eligible", () => {
    const baseline = {
      coverage: {
        functionsFound: 20,
        functionsHit: 18,
        linesFound: 100,
        linesHit: 90,
      },
      absentSources: { "packages/legacy/src/index.ts": "legacy-hash" },
    };
    const promotion = promoteCoveredSources({
      baseline,
      coveredSources: new Set(),
      eligibleSources: ["packages/legacy/src/index.ts"],
      hashes: { "packages/legacy/src/index.ts": "legacy-hash" },
    });

    expect(promotion.promotedSources).toEqual([]);
    expect(promotion.baseline).toEqual(baseline);
    expect(promotion.sourceViolations).toEqual([]);
  });
});
