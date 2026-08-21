import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assessmentFindings } from "./dependency-score-findings.ts";
import {
  classifyAssessment,
  criticalVulnerabilities,
  findingCodes,
  githubRepository,
  validateScorePolicy,
} from "./dependency-score-policy.ts";

async function committedPolicy() {
  return JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("../config/dependency-score-policy.json", import.meta.url),
      ),
      "utf8",
    ),
  );
}

const now = "2026-08-20T00:00:00.000Z";

function sourceRepositoryFixture(overrides = {}) {
  return {
    archived: false,
    full_name: "fixture/fixture",
    pushed_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function healthySignals(overrides = {}) {
  return {
    criticalVulnerabilityIds: [],
    deprecated: undefined,
    downloads: { downloads: 50_000 },
    lifecycleScripts: [],
    name: "fixture",
    nativeBuildFiles: [],
    now,
    packageCreated: "2020-01-01T00:00:00.000Z",
    provenance: { attestations: [] },
    releasePublished: "2026-07-01T00:00:00.000Z",
    repository: {
      type: "git",
      url: "git+https://github.com/fixture/fixture.git",
    },
    similarNames: [],
    sourceRepository: sourceRepositoryFixture(),
    vulnerabilities: { vulns: [] },
    ...overrides,
  };
}

describe("committed dependency score policy", () => {
  test("validates and covers every finding code", async () => {
    const policy = await committedPolicy();
    validateScorePolicy(policy);
    expect(Object.keys(policy.confidenceDeductions).sort()).toEqual(
      findingCodes,
    );
  });
});

describe("assessmentFindings", () => {
  test("healthy signals produce no findings", async () => {
    const policy = await committedPolicy();
    expect(assessmentFindings(healthySignals({ policy }))).toEqual([]);
  });

  test("flags each policy finding code", async () => {
    const policy = await committedPolicy();
    const cases = [
      ["deprecated-release", { deprecated: "use fixture2 instead" }],
      [
        "lifecycle-scripts",
        { lifecycleScripts: ["postinstall: node prep.js"] },
      ],
      [
        "native-build-files",
        { nativeBuildFiles: ["package/prebuilds/fixture.node"] },
      ],
      [
        "missing-repository",
        { repository: undefined, sourceRepository: undefined },
      ],
      ["missing-provenance", { provenance: undefined }],
      ["young-package", { packageCreated: "2026-08-01T00:00:00.000Z" }],
      ["stale-release", { releasePublished: "2023-01-01T00:00:00.000Z" }],
      ["low-downloads", { downloads: { downloads: 10 } }],
      [
        "archived-repository",
        { sourceRepository: sourceRepositoryFixture({ archived: true }) },
      ],
      [
        "stale-repository",
        {
          sourceRepository: sourceRepositoryFixture({
            pushed_at: "2023-01-01T00:00:00.000Z",
          }),
        },
      ],
      [
        "repository-mismatch",
        {
          sourceRepository: sourceRepositoryFixture({
            full_name: "somewhere/else",
          }),
        },
      ],
      [
        "similar-name",
        {
          similarNames: [
            { name: "fixturejs", date: "2020-01-01T00:00:00.000Z" },
          ],
        },
      ],
      [
        "critical-vulnerability",
        {
          vulnerabilities: { vulns: [{ id: "GHSA-critical" }] },
          criticalVulnerabilityIds: ["GHSA-critical"],
        },
      ],
      [
        "known-vulnerability",
        { vulnerabilities: { vulns: [{ id: "GHSA-known" }] } },
      ],
    ];
    for (const [code, overrides] of cases) {
      const findings = assessmentFindings(
        healthySignals({ policy, ...overrides }),
      );
      expect(findings.map((finding) => finding.code)).toEqual([code]);
    }
  });

  test("ignores similarly named packages younger than the policy minimum", async () => {
    const policy = await committedPolicy();
    const signals = healthySignals({
      policy,
      similarNames: [{ name: "fixturejs", date: "2026-08-01T00:00:00.000Z" }],
    });
    expect(assessmentFindings(signals)).toEqual([]);
  });
});

describe("classifyAssessment", () => {
  test("scores a clean assessment at 100", async () => {
    const policy = await committedPolicy();
    const result = classifyAssessment([], policy);
    expect(result.confidenceScore).toBe(100);
    expect(result.confidenceTier).toBe("normal");
    expect(result.policyVersion).toBe(policy.policyVersion);
  });

  test("deducts and tiers from the policy", async () => {
    const policy = await committedPolicy();
    const critical = classifyAssessment(
      [{ code: "critical-vulnerability", message: "x" }],
      policy,
    );
    expect(critical.confidenceScore).toBe(0);
    expect(critical.confidenceTier).toBe("high-warning");
    const deprecated = classifyAssessment(
      [{ code: "deprecated-release", message: "x" }],
      policy,
    );
    expect(deprecated.confidenceScore).toBe(40);
    expect(deprecated.confidenceTier).toBe("warning");
    const low = classifyAssessment(
      [{ code: "low-downloads", message: "x" }],
      policy,
    );
    expect(low.confidenceScore).toBe(85);
    expect(low.confidenceTier).toBe("normal");
  });

  test("floors the score at zero", async () => {
    const policy = await committedPolicy();
    const result = classifyAssessment(
      [
        { code: "deprecated-release", message: "x" },
        { code: "young-package", message: "x" },
        { code: "archived-repository", message: "x" },
      ],
      policy,
    );
    expect(result.confidenceScore).toBe(0);
  });

  test("attaches the configured deduction to each finding", async () => {
    const policy = await committedPolicy();
    const result = classifyAssessment(
      [{ code: "lifecycle-scripts", message: "x" }],
      policy,
    );
    expect(result.findings).toEqual([
      { code: "lifecycle-scripts", message: "x", deduction: 25 },
    ]);
  });

  test("rejects findings without a configured deduction", async () => {
    const policy = await committedPolicy();
    expect(() =>
      classifyAssessment([{ code: "made-up-code", message: "x" }], policy),
    ).toThrow("assessment finding has no configured deduction: made-up-code");
  });

  test("rejects invalid policies", async () => {
    const policy = await committedPolicy();
    expect(() =>
      classifyAssessment([], { ...policy, policyVersion: 0 }),
    ).toThrow();
    expect(() =>
      classifyAssessment([], { ...policy, warningBelow: 25 }),
    ).toThrow();
    expect(() =>
      classifyAssessment([], { ...policy, warningBelow: 101 }),
    ).toThrow();
  });
});

describe("validateScorePolicy", () => {
  test("accepts the committed policy", async () => {
    expect(validateScorePolicy(await committedPolicy())).toBeUndefined();
  });

  test("rejects a missing or out-of-range minimumScore", async () => {
    const policy = await committedPolicy();
    const { minimumScore, ...withoutMinimum } = policy;
    expect(() => validateScorePolicy(withoutMinimum)).toThrow("minimumScore");
    expect(() =>
      validateScorePolicy({ ...policy, minimumScore: 101 }),
    ).toThrow();
  });

  test("rejects a policy missing a finding deduction", async () => {
    const policy = await committedPolicy();
    const incomplete = {
      ...policy,
      confidenceDeductions: { ...policy.confidenceDeductions },
    };
    delete incomplete.confidenceDeductions["missing-repository"];
    expect(() => validateScorePolicy(incomplete)).toThrow(
      "assessment finding has no configured deduction: missing-repository",
    );
  });
});

describe("criticalVulnerabilities", () => {
  test("flags CVSS 3 vectors scoring at least 9", () => {
    const vulnerabilities = {
      vulns: [
        {
          id: "GHSA-1",
          severity: [
            {
              type: "CVSS_V3",
              score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
            },
          ],
        },
      ],
    };
    expect(criticalVulnerabilities(vulnerabilities)).toEqual(["GHSA-1"]);
  });

  test("flags database-specific CRITICAL severities", () => {
    const vulnerabilities = {
      vulns: [{ id: "GHSA-2", database_specific: { severity: "CRITICAL" } }],
    };
    expect(criticalVulnerabilities(vulnerabilities)).toEqual(["GHSA-2"]);
  });

  test("leaves non-critical severities out", () => {
    const vulnerabilities = {
      vulns: [{ id: "GHSA-3", database_specific: { severity: "HIGH" } }],
    };
    expect(criticalVulnerabilities(vulnerabilities)).toEqual([]);
  });

  test("sorts and names unnamed entries", () => {
    const vulnerabilities = {
      vulns: [
        { database_specific: { severity: "critical" } },
        { id: "GHSA-0", database_specific: { severity: "CRITICAL" } },
      ],
    };
    expect(criticalVulnerabilities(vulnerabilities)).toEqual([
      "GHSA-0",
      "unnamed OSV entry",
    ]);
  });
});

describe("githubRepository", () => {
  test("parses GitHub URLs from registry metadata", () => {
    expect(githubRepository("git+https://github.com/fixture/fixture.git")).toBe(
      "fixture/fixture",
    );
    expect(
      githubRepository({ url: "https://github.com/fixture/fixture" }),
    ).toBe("fixture/fixture");
    expect(
      githubRepository("https://www.github.com/fixture/fixture#readme"),
    ).toBe("fixture/fixture");
  });

  test("returns undefined for non-GitHub repositories", () => {
    expect(
      githubRepository("https://gitlab.com/fixture/fixture.git"),
    ).toBeUndefined();
    expect(githubRepository(undefined)).toBeUndefined();
  });
});
