import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../../server/api/create-api.js";
import { ArtifactRegistry } from "../../server/artifacts/artifact-registry.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { migrate } from "../../server/database/migrate.js";
import { WorkflowExecutor } from "../../server/workflows/workflow-executor.js";
import type { WorkflowDefinition } from "../../server/workflows/workflow-definition.js";
import {
  WorkflowRunRepository,
  type StepLease,
} from "../../server/workflows/workflow-run-repository.js";

/**
 * End-to-end scenario for the workflow kernel. It crosses the API, the
 * workflow executor (worker), PostgreSQL, and the content-addressed artifact
 * registry; it survives a simulated worker loss and resumes from the last
 * committed checkpoint; and it verifies both successful and denied behavior at
 * the control-plane boundary. All fixtures are synthetic, non-sensitive bytes.
 */
describe("typed workflow resume after worker interruption", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;

  const workflow: WorkflowDefinition = {
    workflowId: "synthetic-resume",
    version: 1,
    steps: [
      {
        kind: "work",
        stepId: "gather",
        artifactShape: { type: "object", requiredKeys: ["summary"] },
        requiredReferences: [],
        budget: { leaseSeconds: 2, maxAttempts: 3 },
      },
      {
        kind: "work",
        stepId: "refine",
        artifactShape: { type: "object", requiredKeys: ["summary"] },
        requiredReferences: [{ kind: "derivative", min: 1 }],
        budget: { leaseSeconds: 2, maxAttempts: 3 },
      },
      {
        kind: "human-gate",
        stepId: "approve",
        prompt: "Approve the refined result?",
        decisionShape: {
          type: "object",
          requiredKeys: ["outcome", "note"],
        },
        budget: { leaseSeconds: 60, maxAttempts: 1 },
      },
      {
        kind: "work",
        stepId: "publish",
        artifactShape: { type: "object", requiredKeys: ["summary"] },
        requiredReferences: [{ kind: "derivative", min: 1 }],
        budget: { leaseSeconds: 2, maxAttempts: 3 },
      },
    ],
  };

  async function startScenario() {
    const store = new FileArtifactStore(join(temporaryRoot, "artifacts"));
    const registry = new ArtifactRegistry(databaseUrl, store);
    const runs = new WorkflowRunRepository(databaseUrl, registry);
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
        await runs.close();
        await registry.close();
      },
    };
  }

  async function forceExpiry(
    runs: WorkflowRunRepository,
    runId: string,
    lease: StepLease,
  ): Promise<void> {
    // Access the repository's pool to simulate a lease expiring before the
    // worker could commit. This is a test-only seam into durable state.
    const pool = (
      runs as unknown as {
        pool: { query: (q: string, p: unknown[]) => Promise<unknown> };
      }
    ).pool;
    await pool.query(
      `UPDATE workflow_step_attempts
          SET lease_until = now() - interval '1 second'
        WHERE run_id = $1 AND step_index = $2 AND attempt = $3`,
      [runId, lease.stepIndex, lease.attempt],
    );
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
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-workflow-e2e-"));
  });

  afterAll(async () => {
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
      let view = (await (
        await fetch(`${scenario.address}/api/workflow-runs/${runId}`)
      ).json()) as {
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
      await forceExpiry(scenario.runs, runId, lostLease);

      // A restarted executor resumes from the last committed checkpoint: it
      // re-leases step 1 (a new attempt) and commits exactly one checkpoint.
      expect(await scenario.executor.runOnce()).toBe(true);

      view = (await (
        await fetch(`${scenario.address}/api/workflow-runs/${runId}`)
      ).json()) as {
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
      const run = await scenario.runs.createRun(
        workflow.workflowId,
        workflow.version,
        { prompt: "synthetic rejectable fixture" },
      );

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
});
