import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ArtifactRegistry } from "../../server/artifacts/artifact-registry.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { migrate } from "../../server/database/migrate.js";
import {
  type WorkflowDefinition,
} from "../../server/workflows/workflow-definition.js";
import {
  ArtifactValidationError,
  WorkflowCommitError,
  WorkflowRunRepository,
  WorkflowDefinitionError,
  type RunView,
} from "../../server/workflows/workflow-run-repository.js";
import {
  forceWorkflowLeaseExpiry,
  queryWorkflowDatabase,
} from "./workflow-test-support.js";

/**
 * Focused invariant tests at the WorkflowRunRepository seam. They prove the
 * workflow-kernel properties the application-level scenario cannot reliably
 * isolate: durable and inspectable versions/attempts/leases/checkpoints/
 * budgets/gates, schema/reference/workflow validity, lease expiry without
 * duplication, and resume from the last committed checkpoint.
 *
 * All fixtures are synthetic, non-sensitive bytes.
 */
describe("workflow run invariants", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;
  let registry: ArtifactRegistry;
  let store: FileArtifactStore;
  let runs: WorkflowRunRepository;

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

  function workSubmission(
    summary: string,
    references: { kind: "derivative"; targetId: string }[] = [],
  ) {
    return {
      content: Buffer.from(JSON.stringify({ summary }), "utf8"),
      policy: { sensitivity: "local-only" as const, rightsBasis: "owned" as const },
      provenance: {
        origin: "original-reasoning" as const,
        detail: "synthetic workflow fixture",
      },
      references,
    };
  }

  function gateSubmission(outcome: "approve" | "reject", note: string) {
    return {
      content: Buffer.from(JSON.stringify({ outcome, note }), "utf8"),
      policy: { sensitivity: "local-only" as const, rightsBasis: "owned" as const },
      provenance: {
        origin: "personal-testimony" as const,
        detail: "synthetic gate decision",
      },
      references: [],
    };
  }

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = container.getConnectionUri();
      stopDatabase = () => container.stop().then(() => undefined);
    }
    await migrate(databaseUrl);
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-workflows-"));
    store = new FileArtifactStore(join(temporaryRoot, "artifacts"));
    registry = new ArtifactRegistry(databaseUrl, store);
    runs = new WorkflowRunRepository(databaseUrl, registry);
    await runs.declare(workflow);
  });

  afterAll(async () => {
    await runs?.close();
    await registry?.close();
    await stopDatabase?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  async function freshRun(): Promise<RunView> {
    return runs.createRun(workflow.workflowId, workflow.version, {
      prompt: "synthetic research fixture",
    });
  }

  it("makes versions, attempts, leases, checkpoints, budgets, and gates durable and inspectable", async () => {
    const run = await freshRun();
    const view = await runs.view(run.id);

    // Version is durable and inspectable.
    expect(view?.workflowId).toBe(workflow.workflowId);
    expect(view?.workflowVersion).toBe(workflow.version);
    expect(view?.steps.map((step) => step.stepId)).toEqual([
      "gather",
      "refine",
      "approve",
      "publish",
    ]);

    // Budgets are declared and inspectable before any work.
    expect(view?.budgets.map((b) => ({ step: b.stepId, max: b.budget.maxAttempts, lease: b.budget.leaseSeconds })))
      .toEqual([
        { step: "gather", max: 3, lease: 2 },
        { step: "refine", max: 3, lease: 2 },
        { step: "approve", max: 1, lease: 60 },
        { step: "publish", max: 3, lease: 2 },
      ]);
    expect(view?.budgets.every((b) => b.attemptsUsed === 0 && !b.activeLease)).toBe(true);

    // No attempts, checkpoints, or gates yet.
    expect(view?.attempts).toEqual([]);
    expect(view?.checkpoints).toEqual([]);
    expect(view?.gates).toEqual([]);

    // Leasing the first step records a durable attempt and lease.
    const lease = await runs.claimNextStep(run.id);
    expect(lease?.stepId).toBe("gather");
    expect(lease?.attempt).toBe(1);

    const leasedView = await runs.view(run.id);
    expect(leasedView?.attempts).toHaveLength(1);
    expect(leasedView?.attempts[0]).toMatchObject({
      stepId: "gather",
      attempt: 1,
      status: "leased",
    });
    expect(leasedView?.attempts[0]?.leaseId).toBe(lease?.leaseId);
    expect(leasedView?.budgets[0]?.attemptsUsed).toBe(1);
    expect(leasedView?.budgets[0]?.activeLease).toBe(true);
  });

  it("commits only schema-valid artifacts", async () => {
    const run = await freshRun();
    const lease = (await runs.claimNextStep(run.id))!;

    await expect(
      runs.commitCheckpoint(run.id, lease, {
        ...workSubmission("x"),
        content: Buffer.from("not-json", "utf8"),
      }),
    ).rejects.toThrow(/not valid JSON/);

    await expect(
      runs.commitCheckpoint(run.id, lease, {
        ...workSubmission("x"),
        content: Buffer.from(JSON.stringify({ wrong: "shape" }), "utf8"),
      }),
    ).rejects.toThrow(/missing required key "summary"/);

    // No checkpoint was recorded for the invalid submissions.
    const before = await runs.view(run.id);
    expect(before?.checkpoints).toEqual([]);
    expect(before?.attempts[0]?.status).toBe("leased");

    const checkpoint = await runs.commitCheckpoint(
      run.id,
      lease,
      workSubmission("gathered evidence"),
    );
    expect(checkpoint.stepIndex).toBe(0);
    expect(checkpoint.artifactHash).toMatch(/^[0-9a-f]{64}$/);

    const after = await runs.view(run.id);
    expect(after?.currentStep).toBe(1);
    expect(after?.checkpoints).toHaveLength(1);
    expect(after?.checkpoints[0]?.artifactHash).toBe(checkpoint.artifactHash);
    expect(after?.attempts[0]?.status).toBe("committed");
  });

  it("commits only reference-valid artifacts", async () => {
    const run = await freshRun();

    // Commit gather so refine has a real derivative to reference.
    const gatherLease = (await runs.claimNextStep(run.id))!;
    const gatherCheckpoint = await runs.commitCheckpoint(
      run.id,
      gatherLease,
      workSubmission("gathered evidence"),
    );

    const refineLease = (await runs.claimNextStep(run.id))!;
    expect(refineLease?.stepId).toBe("refine");

    // Missing the required derivative reference.
    await expect(
      runs.commitCheckpoint(run.id, refineLease, workSubmission("refined without reference")),
    ).rejects.toThrow(/at least 1 derivative reference/);

    // A derivative reference that does not resolve to a registered artifact.
    await expect(
      runs.commitCheckpoint(run.id, refineLease, {
        ...workSubmission("refined against nothing"),
        references: [
          { kind: "derivative", targetId: "0".repeat(64) },
        ],
      }),
    ).rejects.toThrow(/does not resolve to a registered artifact/);

    // A resolved derivative reference commits the checkpoint.
    const checkpoint = await runs.commitCheckpoint(run.id, refineLease, {
      ...workSubmission("refined against gathered evidence"),
      references: [{ kind: "derivative", targetId: gatherCheckpoint.artifactHash }],
    });
    expect(checkpoint.stepIndex).toBe(1);

    const view = await runs.view(run.id);
    expect(view?.currentStep).toBe(2);
    expect(view?.checkpoints.map((c) => c.stepIndex)).toEqual([0, 1]);
  });

  it("commits only workflow-valid artifacts (current step, active lease, matching attempt)", async () => {
    const run = await freshRun();
    const lease = (await runs.claimNextStep(run.id))!;

    // A fabricated lease for a non-current step (step 5) is not workflow-valid.
    await expect(
      runs.commitCheckpoint(
        run.id,
        { ...lease, stepIndex: 5, stepId: "nope", stepKind: "work" },
        workSubmission("x"),
      ),
    ).rejects.toThrow(/not declared/);

    // Committing with a wrong lease id is rejected.
    await expect(
      runs.commitCheckpoint(
        run.id,
        { ...lease, leaseId: randomUUID() },
        workSubmission("x"),
      ),
    ).rejects.toThrow(/Lease id does not match/);

    // The valid lease still commits after the rejected attempts.
    const checkpoint = await runs.commitCheckpoint(run.id, lease, workSubmission("ok"));
    expect(checkpoint.stepIndex).toBe(0);

    // Re-committing the same (now committed) attempt is idempotent and harmless.
    const again = await runs.commitCheckpoint(run.id, lease, workSubmission("ok"));
    expect(again.attempt).toBe(checkpoint.attempt);

    const view = await runs.view(run.id);
    expect(view?.checkpoints).toHaveLength(1);
    expect(view?.currentStep).toBe(1);
  });

  it("resume starts from the last committed checkpoint rather than restarting", async () => {
    const run = await freshRun();

    // One worker commits step 0, then "dies" (no further leases from it).
    const lease0 = (await runs.claimNextStep(run.id))!;
    const checkpoint0 = await runs.commitCheckpoint(
      run.id,
      lease0,
      workSubmission("step zero done"),
    );

    // A new worker leases the next step: it must get step 1, not step 0 again.
    // A new lease on step 0 is impossible because current_step has advanced.
    const lease1 = (await runs.claimNextStep(run.id))!;
    expect(lease1?.stepIndex).toBe(1);
    expect(lease1?.stepId).toBe("refine");

    // Re-committing the same committed attempt is idempotent: it cannot
    // create a second checkpoint or duplicate the committed work.
    const redo = await runs.commitCheckpoint(
      run.id,
      lease0,
      workSubmission("stale redo"),
    );
    expect(redo.attempt).toBe(checkpoint0.attempt);
    expect(redo.artifactHash).toBe(checkpoint0.artifactHash);

    const view = await runs.view(run.id);
    expect(view?.currentStep).toBe(1);
    expect(view?.checkpoints).toHaveLength(1);
    expect(view?.checkpoints.map((c) => c.stepIndex)).toEqual([0]);
  });

  it("lease expiry or simulated worker loss does not duplicate committed work", async () => {
    const run = await freshRun();

    // First worker leases step 0 and then loses connectivity before committing.
    const lostLease = (await runs.claimNextStep(run.id))!;
    expect(lostLease?.attempt).toBe(1);

    // Simulate worker loss: expire the first lease directly.
    await forceWorkflowLeaseExpiry(databaseUrl, run.id, lostLease);

    // A second worker can now lease the same step; it gets a new attempt.
    const secondLease = (await runs.claimNextStep(run.id))!;
    expect(secondLease?.attempt).toBe(2);
    expect(secondLease?.leaseId).not.toBe(lostLease.leaseId);

    // The first worker revives and tries to commit its stale lease: rejected,
    // because the lease is no longer the active lease for that step.
    await expect(
      runs.commitCheckpoint(run.id, lostLease, workSubmission("stale commit")),
    ).rejects.toThrow(/expired|Lease id does not match/);

    // The second worker commits; exactly one checkpoint is recorded for step 0.
    const checkpoint = await runs.commitCheckpoint(
      run.id,
      secondLease,
      workSubmission("second worker commits"),
    );
    expect(checkpoint.attempt).toBe(2);

    const view = await runs.view(run.id);
    expect(view?.checkpoints).toHaveLength(1);
    expect(view?.checkpoints[0]?.attempt).toBe(2);
    expect(view?.attempts.filter((a) => a.status === "committed")).toHaveLength(1);
    expect(view?.currentStep).toBe(1);
  });

  it("declares human gates that are durable, inspectable, and gate progress", async () => {
    const run = await freshRun();

    // Advance through gather and refine.
    const gatherLease = (await runs.claimNextStep(run.id))!;
    const gather = await runs.commitCheckpoint(
      run.id,
      gatherLease,
      workSubmission("gathered"),
    );
    const refineLease = (await runs.claimNextStep(run.id))!;
    await runs.commitCheckpoint(run.id, refineLease, {
      ...workSubmission("refined"),
      references: [{ kind: "derivative", targetId: gather.artifactHash }],
    });

    // The run reaches the gate. Leasing it raises a pending gate row.
    const gateLease = (await runs.claimNextStep(run.id))!;
    expect(gateLease?.stepKind).toBe("human-gate");
    expect(gateLease?.stepId).toBe("approve");

    let view = await runs.view(run.id);
    expect(view?.gates).toHaveLength(1);
    expect(view?.gates[0]).toMatchObject({ stepId: "approve", status: "pending" });
    expect(view?.gates[0]?.decisionHash).toBeNull();

    // The gate blocks advance until a human decision is committed.
    expect(view?.currentStep).toBe(2);

    // An invalid decision shape is schema-invalid.
    await expect(
      runs.commitCheckpoint(run.id, gateLease, {
        ...gateSubmission("approve", "ok"),
        content: Buffer.from(JSON.stringify({ outcome: "maybe", note: "?" }), "utf8"),
      }),
    ).rejects.toThrow(/outcome must be approve or reject/);

    // A reject decision fails the run and records the rejected gate.
    // (Use a fresh run so approve can be tested afterwards.)
    const rejectRun = await freshRun();
    const rGather = (await runs.claimNextStep(rejectRun.id))!;
    const rGatherCheckpoint = await runs.commitCheckpoint(rejectRun.id, rGather, workSubmission("g"));
    const rRefine = (await runs.claimNextStep(rejectRun.id))!;
    await runs.commitCheckpoint(rejectRun.id, rRefine, {
      ...workSubmission("r"),
      references: [{ kind: "derivative", targetId: rGatherCheckpoint.artifactHash }],
    });
    const rGate = (await runs.claimNextStep(rejectRun.id))!;
    await runs.commitCheckpoint(rejectRun.id, rGate, gateSubmission("reject", "not good enough"));
    const rejectedView = await runs.view(rejectRun.id);
    expect(rejectedView?.status).toBe("failed");
    expect(rejectedView?.gates[0]?.status).toBe("rejected");
    expect(rejectedView?.gates[0]?.decisionHash).not.toBeNull();

    // An approve decision satisfies the gate and advances the run.
    const approveCheckpoint = await runs.commitCheckpoint(
      run.id,
      gateLease,
      gateSubmission("approve", "looks good"),
    );
    expect(approveCheckpoint.stepIndex).toBe(2);

    view = await runs.view(run.id);
    expect(view?.gates[0]?.status).toBe("satisfied");
    expect(view?.gates[0]?.decisionHash).toBe(approveCheckpoint.artifactHash);
    expect(view?.currentStep).toBe(3);
    expect(view?.status).toBe("running");
  });

  it("exhausting a step's attempt budget fails the run", async () => {
    // A workflow with a one-attempt step.
    const tight: WorkflowDefinition = {
      workflowId: "synthetic-tight",
      version: 1,
      steps: [
        {
          kind: "work",
          stepId: "only",
          artifactShape: { type: "object", requiredKeys: ["summary"] },
          requiredReferences: [],
          budget: { leaseSeconds: 2, maxAttempts: 2 },
        },
      ],
    };
    await runs.declare(tight);
    const run = await runs.createRun(tight.workflowId, tight.version, { prompt: "tight" });

    const first = (await runs.claimNextStep(run.id))!;
    expect(first?.attempt).toBe(1);
    await forceWorkflowLeaseExpiry(databaseUrl, run.id, first);

    const second = (await runs.claimNextStep(run.id))!;
    expect(second?.attempt).toBe(2);
    await forceWorkflowLeaseExpiry(databaseUrl, run.id, second);

    // A third lease exceeds maxAttempts: the run fails and no lease is returned.
    const third = await runs.claimNextStep(run.id);
    expect(third).toBeUndefined();

    const view = await runs.view(run.id);
    expect(view?.status).toBe("failed");
    expect(view?.budgets[0]?.attemptsUsed).toBe(2);
    expect(view?.checkpoints).toEqual([]);
  });

  it("refuses to rewrite a committed checkpoint at the database boundary", async () => {
    const run = await freshRun();
    const lease = (await runs.claimNextStep(run.id))!;
    await runs.commitCheckpoint(run.id, lease, workSubmission("sealed"));

    await expect(
      queryWorkflowDatabase(
        databaseUrl,
        `UPDATE workflow_step_attempts SET artifact_hash = 'tampered'
          WHERE run_id = $1 AND step_index = 0`,
        [run.id],
      ),
    ).rejects.toThrow(/immutable/);

    await expect(
      queryWorkflowDatabase(
        databaseUrl,
        `DELETE FROM workflow_step_attempts WHERE run_id = $1 AND step_index = 0`,
        [run.id],
      ),
    ).rejects.toThrow(/immutable/);
  });

  it("refuses malformed workflow declarations", async () => {
    const malformed = [
      { ...workflow, workflowId: "invalid-kind", steps: [{ ...workflow.steps[0], kind: "other" }] },
      {
        ...workflow,
        workflowId: "invalid-shape",
        steps: [{ ...workflow.steps[0], artifactShape: { type: "number" } }],
      },
      {
        ...workflow,
        workflowId: "invalid-reference",
        steps: [
          {
            ...workflow.steps[0],
            requiredReferences: [{ kind: "citation", min: -1 }],
          },
        ],
      },
    ];

    for (const definition of malformed) {
      await expect(
        runs.declare(definition as unknown as WorkflowDefinition),
      ).rejects.toBeInstanceOf(WorkflowDefinitionError);
    }
  });

  it("uses database time to decide whether a lease is active", async () => {
    const run = await freshRun();
    const lease = (await runs.claimNextStep(run.id))!;
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
    try {
      expect((await runs.view(run.id))?.budgets[0]?.activeLease).toBe(true);
      await expect(
        runs.commitCheckpoint(run.id, lease, workSubmission("database clock")),
      ).resolves.toMatchObject({ stepIndex: 0 });
    } finally {
      clock.mockRestore();
    }
  });

  it("refuses to rewrite a workflow definition at the database boundary", async () => {
    await expect(
      queryWorkflowDatabase(
        databaseUrl,
        `UPDATE workflow_definitions SET definition = '{}'::jsonb
          WHERE workflow_id = $1 AND version = $2`,
        [workflow.workflowId, workflow.version],
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      queryWorkflowDatabase(
        databaseUrl,
        `DELETE FROM workflow_definitions
          WHERE workflow_id = $1 AND version = $2`,
        [workflow.workflowId, workflow.version],
      ),
    ).rejects.toThrow(/append-only/);
  });
});
