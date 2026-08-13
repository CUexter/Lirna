import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../../server/api/create-api.js";
import { ArtifactRegistry } from "../../server/artifacts/artifact-registry.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { ApplicationDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import type { WorkflowDefinition } from "../../server/workflows/workflow-definition.js";
import type { ExecutorAdapter } from "../../server/workflows/workflow-executor.js";
import { WorkflowExecutor } from "../../server/workflows/workflow-executor.js";
import { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";
import { resetTestDatabase } from "./database-test-support.js";
import { syntheticResumeWorkflow } from "./workflow-fixtures.js";
import { forceWorkflowLeaseExpiry } from "./workflow-test-support.js";

/**
 * Integration scenario for the workflow kernel. It crosses the API, the
 * workflow executor (worker), PostgreSQL, and the content-addressed artifact
 * registry; it survives a simulated worker loss and resumes from the last
 * committed checkpoint; and it verifies both successful and denied behavior at
 * the control-plane boundary. All fixtures are synthetic, non-sensitive bytes.
 */
describe("typed workflow resume after worker interruption", () => {
  let databaseUrl: string;
  let database: ApplicationDatabase;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;

  const workflow = syntheticResumeWorkflow;

  const routedWorkflow: WorkflowDefinition = {
    workflowId: "synthetic-policy-routing",
    version: 1,
    steps: [
      {
        kind: "work",
        stepId: "synthesize",
        artifactShape: { type: "object", requiredKeys: ["summary"] },
        requiredReferences: [],
        routing: {
          capability: "synthetic",
          qualityFloor: 80,
          localQualityTolerance: 5,
          maxLatencyMs: 1_000,
          budget: 0,
        },
        budget: { leaseSeconds: 2, maxAttempts: 3 },
      },
    ],
  };

  async function startScenario() {
    const store = new FileArtifactStore(join(temporaryRoot, "artifacts"));
    const registry = new ArtifactRegistry(database.db, store);
    const runs = new WorkflowRunRepository(database.db, registry);
    const executor = new WorkflowExecutor(runs);
    const api = createApi({
      operations: {} as never,
      artifacts: store,
      domain: {} as never,
      workflows: runs,
    });
    const address = await api.listen();
    return {
      address,
      runs,
      executor,
      close: async () => {
        await api.close();
      },
    };
  }

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const database = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = database.getConnectionUri();
      stopDatabase = () => database.stop().then(() => undefined);
    }
    await migrate(databaseUrl);
    database = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(database.db);
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-workflow-integration-"));
  });

  afterAll(async () => {
    await database?.close();
    await stopDatabase?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("resumes from the last committed checkpoint after worker loss and denies invalid gate decisions", async () => {
    const scenario = await startScenario();
    try {
      await scenario.runs.declare(workflow);

      // Create a run through the public control plane.
      const created = (await (
        await fetch(`${scenario.address}/api/workflow-runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workflowId: workflow.workflowId,
            version: workflow.version,
            input: { prompt: "synthetic research fixture" },
          }),
        })
      ).json()) as { id: string; status: string; currentStep: number };
      expect(created.status).toBe("running");
      expect(created.currentStep).toBe(0);

      const runId = created.id;

      // Step 0: the executor leases and commits the gather checkpoint.
      expect(await scenario.executor.runOnce()).toBe(true);
      let view = (await (await fetch(`${scenario.address}/api/workflow-runs/${runId}`)).json()) as {
        currentStep: number;
        checkpoints: Array<{ stepIndex: number; attempt: number }>;
        attempts: Array<{ stepIndex: number; attempt: number; status: string }>;
      };
      expect(view.currentStep).toBe(1);
      expect(view.checkpoints.map((c) => c.stepIndex)).toEqual([0]);

      // Simulate worker loss on step 1: a worker leases the step, then dies
      // before committing. The lease is expired directly to model the loss.
      const lostLease = (await scenario.runs.claimNextStep(runId))!;
      expect(lostLease.stepIndex).toBe(1);
      await forceWorkflowLeaseExpiry(database.db, runId, lostLease);

      // A restarted executor resumes from the last committed checkpoint: it
      // re-leases step 1 (a new attempt) and commits exactly one checkpoint.
      const restartedStore = new FileArtifactStore(join(temporaryRoot, "artifacts"));
      const restartedRegistry = new ArtifactRegistry(database.db, restartedStore);
      const restartedRuns = new WorkflowRunRepository(database.db, restartedRegistry);
      const restartedExecutor = new WorkflowExecutor(restartedRuns);
      expect(await restartedExecutor.runOnce()).toBe(true);

      view = (await (await fetch(`${scenario.address}/api/workflow-runs/${runId}`)).json()) as {
        currentStep: number;
        checkpoints: Array<{ stepIndex: number; attempt: number }>;
        attempts: Array<{ stepIndex: number; attempt: number; status: string }>;
      };
      expect(view.currentStep).toBe(2);
      expect(view.checkpoints.map((c) => c.stepIndex)).toEqual([0, 1]);
      const stepOneAttempts = view.attempts.filter((a) => a.stepIndex === 1);
      expect(stepOneAttempts).toHaveLength(2);
      expect(stepOneAttempts.find((a) => a.attempt === 1)?.status).toBe("expired");
      expect(stepOneAttempts.find((a) => a.attempt === 2)?.status).toBe("committed");
      expect(view.checkpoints.find((c) => c.stepIndex === 1)?.attempt).toBe(2);

      // The run is now at the human gate. The executor skips gate steps and
      // cannot advance the run on its own.
      expect(await scenario.executor.runOnce()).toBe(false);

      // Denied behavior: an invalid gate decision is rejected at the boundary.
      const invalidOutcome = await fetch(
        `${scenario.address}/api/workflow-runs/${runId}/gates/2/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: "maybe", note: "?" }),
        },
      );
      expect(invalidOutcome.status).toBe(400);

      // Denied behavior: a decision against a non-current gate is rejected.
      const staleGate = await fetch(
        `${scenario.address}/api/workflow-runs/${runId}/gates/0/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: "approve", note: "stale" }),
        },
      );
      expect(staleGate.status).toBe(409);

      // Successful behavior: a human approves the gate through the control
      // plane. The decision artifact is committed as the gate's checkpoint and
      // the run advances to step 3.
      const approveResponse = await fetch(
        `${scenario.address}/api/workflow-runs/${runId}/gates/2/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: "approve", note: "approved by human" }),
        },
      );
      expect(approveResponse.status).toBe(200);
      const afterGate = (await approveResponse.json()) as {
        currentStep: number;
        gates: Array<{ stepIndex: number; status: string; decisionHash: string | null }>;
      };
      expect(afterGate.currentStep).toBe(3);
      expect(afterGate.gates[0]?.status).toBe("satisfied");
      expect(afterGate.gates[0]?.decisionHash).not.toBeNull();

      // Step 3: the executor commits the final checkpoint and the run completes.
      expect(await scenario.executor.runOnce()).toBe(true);
      const completed = (await (
        await fetch(`${scenario.address}/api/workflow-runs/${runId}`)
      ).json()) as {
        status: string;
        currentStep: number;
        checkpoints: Array<{ stepIndex: number }>;
        gates: Array<{ stepIndex: number; status: string }>;
      };
      expect(completed.status).toBe("completed");
      expect(completed.checkpoints.map((c) => c.stepIndex)).toEqual([0, 1, 2, 3]);
      expect(completed.gates[0]?.status).toBe("satisfied");
    } finally {
      await scenario.close();
    }
  });

  it("fails the run when a gate is rejected, and the rejection is durable and inspectable", async () => {
    const scenario = await startScenario();
    try {
      await scenario.runs.declare(workflow);
      const run = await scenario.runs.createRun(workflow.workflowId, workflow.version, {
        prompt: "synthetic rejectable fixture",
      });

      // Advance through gather, refine, and reach the gate.
      await scenario.executor.runOnce();
      await scenario.executor.runOnce();
      expect((await scenario.runs.view(run.id))?.currentStep).toBe(2);

      const rejectResponse = await fetch(
        `${scenario.address}/api/workflow-runs/${run.id}/gates/2/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: "reject", note: "not good enough" }),
        },
      );
      expect(rejectResponse.status).toBe(200);
      const afterReject = (await rejectResponse.json()) as {
        status: string;
        gates: Array<{ stepIndex: number; status: string; decisionHash: string | null }>;
      };
      expect(afterReject.status).toBe("failed");
      expect(afterReject.gates[0]?.status).toBe("rejected");
      expect(afterReject.gates[0]?.decisionHash).not.toBeNull();

      // A failed run cannot be advanced further: the executor finds no work.
      expect(await scenario.executor.runOnce()).toBe(false);

      // The rejection remains durable and inspectable on a later read.
      const later = (await (
        await fetch(`${scenario.address}/api/workflow-runs/${run.id}`)
      ).json()) as {
        status: string;
        gates: Array<{ stepIndex: number; status: string }>;
        checkpoints: Array<{ stepIndex: number }>;
      };
      expect(later.status).toBe("failed");
      expect(later.gates[0]?.status).toBe("rejected");
      // The rejected gate decision is itself a committed checkpoint (the
      // decision artifact); the run has not advanced past the gate.
      expect(later.checkpoints.map((c) => c.stepIndex)).toEqual([0, 1, 2]);
    } finally {
      await scenario.close();
    }
  });

  it("records the actual eligible endpoint and constrained evidence before routed work commits", async () => {
    const scenario = await startScenario();
    try {
      await scenario.runs.declare(routedWorkflow);
      const run = await scenario.runs.createRun(routedWorkflow.workflowId, routedWorkflow.version, {
        prompt: "synthetic routed fixture",
        evidence: [
          {
            evidenceId: "source-state-eligible",
            policy: {
              sensitivity: "local-only",
              rightsBasis: "owned",
            },
          },
          {
            evidenceId: "source-state-inaccessible",
            policy: {
              sensitivity: "local-only",
              rightsBasis: "inaccessible",
            },
          },
        ],
      });

      expect(await scenario.executor.runOnce()).toBe(true);
      const view = await scenario.runs.view(run.id);

      expect(view?.status).toBe("completed");
      expect(view?.routingDecisions).toHaveLength(1);
      expect(view?.routingDecisions[0]?.decision).toMatchObject({
        outcome: "selected",
        executorId: "local-synthetic",
        endpoint: "local://synthetic",
        disclosedEvidence: ["source-state-eligible"],
        omittedEvidence: [
          {
            evidenceId: "source-state-inaccessible",
            reason: "rights basis inaccessible prohibits content retrieval",
          },
        ],
      });
      expect(view?.routingDecisions[0]?.recordedAt).toEqual(expect.any(String));
      expect(view?.checkpoints).toHaveLength(1);
    } finally {
      await scenario.close();
    }
  });

  it("resumes from a selected route recorded before worker loss", async () => {
    const scenario = await startScenario();
    try {
      await scenario.runs.declare(routedWorkflow);
      const run = await scenario.runs.createRun(routedWorkflow.workflowId, routedWorkflow.version, {
        prompt: "synthetic routing interruption",
        evidence: [],
      });
      await scenario.runs.recordRoutingDecision(run.id, 0, {
        outcome: "selected",
        executorId: "local-synthetic",
        endpoint: "local://synthetic",
        reason: "Local executor is materially comparable",
        fallback: "none",
        disclosedEvidence: [],
        omittedEvidence: [],
      });

      expect(await scenario.executor.runOnce()).toBe(true);
      const view = await scenario.runs.view(run.id);
      expect(view?.status).toBe("completed");
      expect(view?.routingDecisions).toHaveLength(1);
      expect(view?.checkpoints).toHaveLength(1);
    } finally {
      await scenario.close();
    }
  });

  it("uses the selected executor adapter to produce the checkpoint", async () => {
    const store = new FileArtifactStore(join(temporaryRoot, "adapter-artifacts"));
    const registry = new ArtifactRegistry(database.db, store);
    const runs = new WorkflowRunRepository(database.db, registry);
    const executedEvidence: string[][] = [];
    const adapter: ExecutorAdapter = {
      executorId: "selected-adapter",
      endpoint: "local://selected-adapter",
      location: "local",
      capabilities: ["synthetic"],
      quality: 100,
      available: true,
      latencyMs: 0,
      cost: 0,
      restrictedCloudEligible: false,
      execute: async ({ evidence }) => {
        executedEvidence.push(evidence.map((item) => item.evidenceId));
        return {
          content: Buffer.from(JSON.stringify({ summary: "adapter output" })),
          policy: { sensitivity: "local-only", rightsBasis: "owned" },
          provenance: {
            origin: "original-reasoning",
            detail: "selected synthetic adapter",
          },
          references: [],
        };
      },
    };
    const executor = new WorkflowExecutor(runs, [adapter], async (item) => ({
      ...item,
      content: Buffer.from("synthetic evidence"),
    }));
    await runs.declare(routedWorkflow);
    const run = await runs.createRun(routedWorkflow.workflowId, routedWorkflow.version, {
      prompt: "synthetic adapter fixture",
      evidence: [
        {
          evidenceId: "source-state-adapter",
          policy: { sensitivity: "local-only", rightsBasis: "owned" },
        },
      ],
    });

    expect(await executor.runOnce()).toBe(true);
    expect(executedEvidence).toEqual([["source-state-adapter"]]);
    expect((await runs.view(run.id))?.routingDecisions[0]?.decision).toMatchObject({
      executorId: "selected-adapter",
      endpoint: "local://selected-adapter",
    });
  });

  it("executes a durably recorded equivalent fallback", async () => {
    const store = new FileArtifactStore(join(temporaryRoot, "fallback-artifacts"));
    const runs = new WorkflowRunRepository(database.db, new ArtifactRegistry(database.db, store));
    const executed: string[] = [];
    const adapter = (executorId: string, available: boolean, quality: number): ExecutorAdapter => ({
      executorId,
      endpoint: `local://${executorId}`,
      location: "local",
      capabilities: ["synthetic"],
      quality,
      available,
      latencyMs: 0,
      cost: 0,
      restrictedCloudEligible: false,
      execute: async () => {
        executed.push(executorId);
        return {
          content: Buffer.from('{"summary":"fallback output"}'),
          policy: { sensitivity: "local-only", rightsBasis: "owned" },
          provenance: { origin: "original-reasoning", detail: "fallback fixture" },
        };
      },
    });
    const primary = adapter("preferred", false, 90);
    const equivalent = adapter("equivalent", true, 90);
    const routedStep = routedWorkflow.steps[0];
    if (!routedStep || routedStep.kind !== "work" || !routedStep.routing) {
      throw new Error("routed workflow fixture requires one routed work step");
    }
    const definition: WorkflowDefinition = {
      ...routedWorkflow,
      workflowId: "equivalent-fallback",
      steps: [
        {
          ...routedStep,
          routing: {
            ...routedStep.routing,
            preferredExecutorId: primary.executorId,
          },
        },
      ],
    };
    await runs.declare(definition);
    const run = await runs.createRun(definition.workflowId, definition.version, { evidence: [] });

    expect(await new WorkflowExecutor(runs, [primary, equivalent]).runOnce()).toBe(true);
    expect(executed).toEqual(["equivalent"]);
    expect((await runs.view(run.id))?.routingDecisions[0]?.decision).toMatchObject({
      outcome: "selected",
      executorId: "equivalent",
      fallback: "automatic-equivalent",
      fallbackFrom: "preferred",
    });
    expect((await runs.view(run.id))?.status).toBe("completed");
  });

  it("keeps a non-equivalent fallback paused across worker polls", async () => {
    const store = new FileArtifactStore(join(temporaryRoot, "paused-fallback-artifacts"));
    const runs = new WorkflowRunRepository(database.db, new ArtifactRegistry(database.db, store));
    const execute = async () => ({
      content: Buffer.from('{"summary":"must not execute"}'),
      policy: { sensitivity: "local-only" as const, rightsBasis: "owned" as const },
      provenance: { origin: "original-reasoning" as const, detail: "paused fixture" },
    });
    const primary: ExecutorAdapter = {
      executorId: "preferred-paused",
      endpoint: "local://preferred-paused",
      location: "local",
      capabilities: ["synthetic"],
      quality: 90,
      available: false,
      latencyMs: 0,
      cost: 0,
      restrictedCloudEligible: false,
      execute,
    };
    const lowerQuality: ExecutorAdapter = {
      ...primary,
      executorId: "lower-quality",
      endpoint: "local://lower-quality",
      quality: 82,
      available: true,
    };
    const routedStep = routedWorkflow.steps[0];
    if (!routedStep || routedStep.kind !== "work" || !routedStep.routing) {
      throw new Error("routed workflow fixture requires one routed work step");
    }
    const definition: WorkflowDefinition = {
      ...routedWorkflow,
      workflowId: "non-equivalent-fallback",
      steps: [
        {
          ...routedStep,
          routing: {
            ...routedStep.routing,
            preferredExecutorId: primary.executorId,
          },
        },
      ],
    };
    await runs.declare(definition);
    const run = await runs.createRun(definition.workflowId, definition.version, { evidence: [] });
    const executor = new WorkflowExecutor(runs, [primary, lowerQuality]);

    expect(await executor.runOnce()).toBe(true);
    expect(await executor.runOnce()).toBe(false);
    const view = await runs.view(run.id);
    expect(view?.status).toBe("paused");
    expect(view?.attempts).toHaveLength(0);
    expect(view?.checkpoints).toHaveLength(0);
    expect(view?.routingDecisions[0]?.decision).toMatchObject({ outcome: "paused" });
  });
});
