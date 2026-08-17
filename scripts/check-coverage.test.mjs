import { describe, expect, test } from "bun:test";

import {
  isEligibleSource,
  sourceBaselineViolations,
} from "./check-coverage.mjs";

describe("coverage source baseline", () => {
  test("recognizes Bun-instrumented source and excludes browser and policy fixtures", () => {
    expect(isEligibleSource("apps/server/src/runtime.mts")).toBe(true);
    expect(isEligibleSource("packages/api/src/runtime.cjs")).toBe(true);
    expect(isEligibleSource("apps/web/src/components/loader.tsx")).toBe(false);
    expect(isEligibleSource("apps/web/src/config/fixture.ts")).toBe(false);
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

  test("retains existing browser baseline entries outside Bun LCOV", () => {
    expect(
      sourceBaselineViolations({
        absentSources: { "apps/web/src/components/loader.tsx": "hash" },
        coveredSources: new Set(),
        eligibleSources: [],
        hashes: {},
      }),
    ).toEqual([]);
  });
});
