import { describe, expect, test } from "bun:test";
import {
  evaluateBudget,
  formatFailures,
  measureBuild,
  validatePolicy,
} from "./check-web-bundle.mjs";

const policy = {
  budget: {
    assetBytes: 100,
    javascriptBytes: 60,
    largestJavascriptBytes: 50,
  },
};

describe("web bundle budget", () => {
  test("unchanged measured output passes", () => {
    expect(
      evaluateBudget(
        {
          totals: {
            assetBytes: 90,
            javascriptBytes: 55,
            largestJavascriptBytes: 45,
          },
        },
        policy,
      ),
    ).toEqual([]);
  });

  test("growth beyond a budget reports the asset, size, budget, and change", () => {
    const failures = evaluateBudget(
      {
        totals: {
          assetBytes: 90,
          javascriptBytes: 61,
          largestJavascriptBytes: 45,
        },
      },
      policy,
    );

    expect(formatFailures(failures)).toContain(
      "aggregate JavaScript (all JavaScript assets): measured 61 bytes, budget 60 bytes; reduce by at least 1 bytes",
    );
  });

  test("source maps and the metrics report are excluded deterministically", async () => {
    const metrics = await measureBuild("tests/fixtures/web-dist");

    expect(metrics.assets.map((asset) => asset.path)).toEqual([
      "assets/app.js",
      "generated/sw.js",
      "index.html",
    ]);
    expect(metrics.totals.javascriptBytes).toBe(13);
  });

  test("budget changes require the reviewed baseline to change with them", () => {
    expect(() =>
      validatePolicy({
        baseline: {
          assetBytes: 100,
          javascriptBytes: 60,
          largestJavascriptBytes: 50,
        },
        budget: {
          assetBytes: 110,
          javascriptBytes: 66,
          largestJavascriptBytes: 55,
        },
        headroomPercent: 10,
      }),
    ).not.toThrow();
    expect(() =>
      validatePolicy({
        baseline: {
          assetBytes: 100,
          javascriptBytes: 60,
          largestJavascriptBytes: 50,
        },
        budget: {
          assetBytes: 111,
          javascriptBytes: 66,
          largestJavascriptBytes: 55,
        },
        headroomPercent: 10,
      }),
    ).toThrow("update the baseline and budget together");
  });
});
