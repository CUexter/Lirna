import { describe, expect, it, vi } from "vitest";
import {
  type ExecutorProfile,
  isRoutingRequirements,
  isSourceHandlingPolicy,
  PolicyAwareExecutorRouter,
  type SourceEvidence,
} from "./executor-router.js";

const local: ExecutorProfile = {
  executorId: "local-model",
  endpoint: "http://127.0.0.1:11434",
  location: "local",
  capabilities: ["synthesis"],
  quality: 80,
  available: true,
  latencyMs: 500,
  cost: 0,
  restrictedCloudEligible: false,
};

const cloud: ExecutorProfile = {
  executorId: "cloud-model",
  endpoint: "https://models.example.test/v1",
  location: "cloud",
  capabilities: ["synthesis"],
  quality: 84,
  available: true,
  latencyMs: 300,
  cost: 2,
  restrictedCloudEligible: true,
};

const evidence: SourceEvidence[] = [
  {
    evidenceId: "source-state-1",
    policy: { sensitivity: "ordinary-cloud", rightsBasis: "publicly-accessible" },
  },
];

describe("policy-aware executor routing", () => {
  it("validates persisted routing requirements", () => {
    expect(
      isRoutingRequirements({
        capability: "synthesis",
        qualityFloor: 70,
        localQualityTolerance: 5,
        maxLatencyMs: 1_000,
        budget: 2,
      }),
    ).toBe(true);
    expect(
      isRoutingRequirements({
        capability: "synthesis",
        qualityFloor: Number.NaN,
        localQualityTolerance: 5,
        maxLatencyMs: 1_000,
        budget: 2,
      }),
    ).toBe(false);
  });

  it("rejects unknown policy values instead of treating them as cloud eligible", () => {
    expect(
      isSourceHandlingPolicy({
        sensitivity: "unclassified",
        rightsBasis: "publicly-accessible",
      }),
    ).toBe(false);
    expect(
      isSourceHandlingPolicy({
        sensitivity: "ordinary-cloud",
        rightsBasis: "unknown",
      }),
    ).toBe(false);
  });

  it("checks policy before retrieval and again before routing, preferring comparable local execution", async () => {
    const retrieve = vi.fn(async (item: SourceEvidence) => ({
      ...item,
      content: Buffer.from("synthetic source evidence"),
    }));
    const router = new PolicyAwareExecutorRouter();

    const prepared = router.prepareRetrieval(evidence, [local, cloud]);
    expect(prepared.eligible.map((item) => item.evidenceId)).toEqual(["source-state-1"]);
    const decision = router.route({
      evidence: prepared.eligible,
      executors: [local, cloud],
      requirements: {
        capability: "synthesis",
        qualityFloor: 75,
        localQualityTolerance: 5,
        maxLatencyMs: 1_000,
        budget: 5,
      },
      omittedEvidence: prepared.omitted,
    });

    await Promise.all(prepared.eligible.map(retrieve));
    expect(retrieve).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({
      outcome: "selected",
      executorId: "local-model",
      endpoint: "http://127.0.0.1:11434",
      fallback: "none",
      disclosedEvidence: ["source-state-1"],
      omittedEvidence: [],
    });
    expect(decision.reason).toMatch(/local.*materially comparable/i);
  });

  it("does not retrieve policy-ineligible evidence and discloses its omission", () => {
    const router = new PolicyAwareExecutorRouter();
    const prepared = router.prepareRetrieval(
      [
        ...evidence,
        {
          evidenceId: "unavailable-state",
          policy: { sensitivity: "local-only", rightsBasis: "inaccessible" },
        },
      ],
      [local, cloud],
    );

    expect(prepared.eligible.map((item) => item.evidenceId)).toEqual(["source-state-1"]);
    expect(prepared.omitted).toEqual([
      {
        evidenceId: "unavailable-state",
        reason: "rights basis inaccessible prohibits content retrieval",
      },
    ]);
  });

  it("falls back automatically only to an equivalent available executor", () => {
    const router = new PolicyAwareExecutorRouter();
    const decision = router.route({
      evidence,
      executors: [
        { ...cloud, executorId: "primary", quality: 90, available: false },
        { ...cloud, executorId: "equivalent", quality: 90, cost: 1 },
      ],
      requirements: {
        capability: "synthesis",
        qualityFloor: 80,
        localQualityTolerance: 0,
        maxLatencyMs: 1_000,
        budget: 5,
        preferredExecutorId: "primary",
      },
      omittedEvidence: [],
    });

    expect(decision).toMatchObject({
      outcome: "selected",
      executorId: "equivalent",
      fallback: "automatic-equivalent",
      fallbackFrom: "primary",
    });
  });

  it("pauses with a concrete choice when fallback changes quality or evidence", () => {
    const router = new PolicyAwareExecutorRouter();
    const decision = router.route({
      evidence: [
        {
          evidenceId: "restricted-state",
          policy: {
            sensitivity: "restricted-cloud",
            rightsBasis: "lawfully-acquired",
          },
        },
      ],
      executors: [
        { ...cloud, executorId: "primary", quality: 90, available: false },
        {
          ...cloud,
          executorId: "lower-quality",
          quality: 82,
          restrictedCloudEligible: false,
        },
      ],
      requirements: {
        capability: "synthesis",
        qualityFloor: 80,
        localQualityTolerance: 0,
        maxLatencyMs: 1_000,
        budget: 5,
        preferredExecutorId: "primary",
      },
      omittedEvidence: [],
    });

    expect(decision).toMatchObject({
      outcome: "paused",
      fallbackFrom: "primary",
      omittedEvidence: [],
    });
    expect(decision.outcome).toBe("paused");
    if (decision.outcome !== "paused") {
      throw new Error("expected routing to pause");
    }
    expect(decision.reason).toMatch(/no equivalent fallback/i);
    expect(decision.choices).toEqual([
      expect.objectContaining({
        executorId: "lower-quality",
        consequences: expect.arrayContaining([
          "quality falls from 90 to 82",
          "restricted-state would be omitted by Source handling policy",
        ]),
      }),
    ]);
  });
});
