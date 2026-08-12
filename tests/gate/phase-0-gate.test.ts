import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../../server/workflows/workflow-definition.js";
import {
  ArtifactValidationError,
  WorkflowCommitError,
} from "../../server/workflows/workflow-run-repository.js";
import { executeTestSql } from "../integration/database-test-support.js";
import { startPhase0Scenario, type Phase0Scenario } from "../support/phase-0-scenario.js";

/**
 * The Phase 0 gate: one reproducible body of evidence that the architecture
 * skeleton keeps its riskiest authority, durability, artifact, workflow, and
 * policy promises before any product data flows are added.
 *
 * All evidence is produced through a single application scenario seam
 * (`startPhase0Scenario`) against disposable real infrastructure — a throwaway
 * PostgreSQL, a temporary content-addressed artifact store, and a synthetic
 * Vault adapter. No private Vault material is ever read or written. Each test
 * drives an invariant through the seam that can isolate it: the HTTP control
 * plane where the promise is observable there, and the owning module contract
 * for the transactional-outbox properties HTTP cannot isolate.
 *
 * The known limitations this gate does not cover, and what it hands to the next
 * phase, are recorded in docs/phase-0-gate.md.
 */
describe("Phase 0 gate", () => {
  let scenario: Phase0Scenario;

  beforeAll(async () => {
    scenario = await startPhase0Scenario();
  });

  afterAll(async () => {
    await scenario?.close();
  });

  // --- Authority: identity, immutable history, transactional outbox ---------

  it("preserves stable identity, immutable history, and an outbox event per revision", async () => {
    const recordId = randomUUID();

    const created = await revise(scenario, recordId, {
      module: "alpha",
      label: "first observation",
      note: "created",
      payload: { step: 1 },
    });
    expect(created.status).toBe(200);
    expect((await created.json()).revision).toBe(1);

    const revised = await revise(scenario, recordId, {
      module: "alpha",
      label: "second observation",
      note: "revised",
      payload: { step: 2 },
    });
    expect(revised.status).toBe(200);

    const view = await readRecord(scenario, recordId);
    // One stable identity survives the revision.
    expect(view.id).toBe(recordId);
    expect(view.ownerModule).toBe("alpha");
    expect(view.revision).toBe(2);
    expect(view.state).toEqual({ label: "second observation", payload: { step: 2 } });
    // Current state, immutable history, and the outbox committed together: one
    // history entry and one outbox event per revision.
    expect(view.history.map((entry) => entry.revision)).toEqual([1, 2]);
    expect(view.events.map((event) => event.revision)).toEqual([1, 2]);
  });

  it("refuses cross-module writes and invariant-violating revisions with no partial writes", async () => {
    const recordId = randomUUID();
    await revise(scenario, recordId, {
      module: "alpha",
      label: "owned by alpha",
      note: "created",
      payload: { step: 1 },
    });

    // A module cannot write another module's owned state through the supported
    // application contract.
    const intrusion = await revise(scenario, recordId, {
      module: "beta",
      label: "beta intrusion",
      note: "should be refused",
      payload: {},
    });
    expect(intrusion.status).toBe(409);

    // A revision that violates the record invariant is refused.
    const invalid = await revise(scenario, recordId, {
      module: "alpha",
      label: "",
      note: "invalid",
      payload: {},
    });
    expect(invalid.status).toBe(422);

    // Neither failed transaction left a partial write behind.
    const view = await readRecord(scenario, recordId);
    expect(view.revision).toBe(1);
    expect(view.history).toHaveLength(1);
    expect(view.events).toHaveLength(1);
  });

  it("rolls back state, history, and the outbox together on an injected fault, and keeps history append-only", async () => {
    const alpha = scenario.domain.module("alpha");
    const recordId = randomUUID();
    await alpha.revise({
      recordId,
      label: "baseline",
      payload: { step: 1 },
      note: "created",
    });

    // A fault injected after state and history are written but before the
    // outbox event must roll back every write in the transaction.
    await expect(
      alpha.revise(
        { recordId, label: "doomed", payload: { step: 2 }, note: "should roll back" },
        {
          beforeOutbox: () => {
            throw new Error("injected fault before outbox write");
          },
        },
      ),
    ).rejects.toThrow(/injected/i);

    const afterFault = await scenario.domain.view(recordId);
    expect(afterFault?.revision).toBe(1);
    expect(afterFault?.history).toHaveLength(1);
    expect(afterFault?.events).toHaveLength(1);

    // Recorded history cannot be rewritten, even at the database boundary.
    await expect(
      executeTestSql(scenario.database, sql`
        UPDATE synthetic_record_revisions SET note = 'tampered'
         WHERE record_id = ${recordId}
      `),
    ).rejects.toThrow(/append-only/i);

    // Successfully recorded publications are not redelivered.
    const relay = scenario.domain.relay();
    let drainedTotal = 0;
    let drained = 0;
    do {
      drained = await relay.drainOnce(async () => {});
      drainedTotal += drained;
    } while (drained > 0);
    expect(drainedTotal).toBeGreaterThanOrEqual(1);
    // Draining again publishes nothing after the publication record commits.
    expect(await relay.drainOnce(async () => {})).toBe(0);
  });

  // --- Artifacts: content-addressed identity and reconciliation -------------

  it("resolves identical bytes to one identity and reconciles integrity problems without silent repair", async () => {
    const bytes = Buffer.from(`synthetic fixture: ${randomUUID()}\n`, "utf8");
    const expectedHash = createHash("sha256").update(bytes).digest("hex");

    const first = await scenario.registry.register({
      content: bytes,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic fixture" },
      references: [{ kind: "source", targetId: "src-1" }],
    });
    const second = await scenario.registry.register({
      content: bytes,
      policy: { sensitivity: "ordinary-cloud", rightsBasis: "publicly-accessible" },
      provenance: { origin: "personal-observation", detail: "competing registration" },
      references: [{ kind: "owned-note", targetId: "note-1" }],
    });
    // Identical bytes never create a conflicting identity. Effective policy is
    // monotonic and each registration's Provenance remains inspectable.
    expect(first.hash).toBe(expectedHash);
    expect(second.hash).toBe(expectedHash);
    expect(second.policy.sensitivity).toBe("local-only");
    expect(second.provenance.detail).toBe("synthetic fixture");
    expect(second.provenanceHistory.map((entry) => entry.detail)).toEqual([
      "synthetic fixture",
      "competing registration",
    ]);

    // A correctly stored, registered artifact is not flagged as a discrepancy.
    let report = await scenario.registry.reconcile();
    expect(report.missing).not.toContain(first.hash);
    expect(report.hashMismatch.map((entry) => entry.hash)).not.toContain(first.hash);

    // Missing object: bytes removed from storage are reported, not repaired.
    const missing = await scenario.registry.register({
      content: Buffer.from(`synthetic missing: ${randomUUID()}\n`, "utf8"),
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic" },
    });
    await unlink(artifactPath(scenario, missing.hash));
    report = await scenario.registry.reconcile();
    expect(report.missing).toContain(missing.hash);
    expect((await scenario.registry.view(missing.hash))?.hash).toBe(missing.hash);

    // Unexpected object: bytes stored without registration are reported.
    const orphan = Buffer.from(`synthetic orphan: ${randomUUID()}\n`, "utf8");
    const stored = await scenario.artifacts.put(orphan);
    report = await scenario.registry.reconcile();
    expect(report.unexpected).toContain(stored.hash);

    // Hash mismatch: tampered bytes are reported without repairing metadata.
    const tampered = await scenario.registry.register({
      content: Buffer.from(`synthetic integrity: ${randomUUID()}\n`, "utf8"),
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic" },
    });
    await writeFile(artifactPath(scenario, tampered.hash), Buffer.from("tampered", "utf8"));
    report = await scenario.registry.reconcile();
    const mismatch = report.hashMismatch.find((entry) => entry.hash === tampered.hash);
    expect(mismatch).toBeDefined();
    expect(mismatch?.actualHash).not.toBe(tampered.hash);
    expect((await scenario.registry.view(tampered.hash))?.hash).toBe(tampered.hash);
  });

  // --- Application operation: control plane, worker, synthetic adapters -----

  it("completes a public application operation end to end through the worker and synthetic adapters", async () => {
    const submitted = await postRaw(scenario, "/api/operations", {
      kind: "synthetic-adapter-roundtrip",
      input: "A synthetic, non-sensitive fixture",
    });
    expect(submitted.status).toBe(202);
    const queued = (await submitted.json()) as { id: string; status: string };
    expect(queued.status).toBe("queued");

    // The background worker claims the operation, writes the artifact to the
    // content-addressed store and the synthetic Vault adapter, and completes it.
    expect(await scenario.worker.runOnce()).toBe(true);

    const view = await getJson(scenario, `/api/operations/${queued.id}`);
    expect(view.status).toBe("completed");
    expect(view.result).toMatchObject({
      artifactUrl: `/api/operations/${queued.id}/artifact`,
      vaultPath: `synthetic/${queued.id}.md`,
    });

    // The stored artifact is observable through the control plane.
    const artifact = await fetch(`${scenario.address}${view.result.artifactUrl}`);
    expect(artifact.status).toBe(200);
    expect(await artifact.text()).toBe(
      "Synthetic operation result\n\nA synthetic, non-sensitive fixture\n",
    );
  });

  // --- Workflow: worker loss, lease expiry, idempotent resume ---------------

  it("resumes from the last committed checkpoint after worker loss without duplicating work", async () => {
    const workflow = resumeWorkflow();
    await scenario.runs.declare(workflow);

    const created = (await postJson(scenario, "/api/workflow-runs", {
      workflowId: workflow.workflowId,
      version: workflow.version,
      input: { prompt: "synthetic resume fixture" },
    })) as { id: string; status: string; currentStep: number };
    expect(created.status).toBe("running");
    const runId = created.id;

    // Step 0 commits its checkpoint.
    expect(await scenario.executor.runOnce()).toBe(true);
    let view = await getJson(scenario, `/api/workflow-runs/${runId}`);
    expect(view.currentStep).toBe(1);
    expect(view.checkpoints.map((c: { stepIndex: number }) => c.stepIndex)).toEqual([0]);

    // Worker loss on step 1: a worker leases the step, then dies before
    // committing. The lease is expired directly to model the loss.
    const lostLease = (await scenario.runs.claimNextStep(runId))!;
    expect(lostLease.stepIndex).toBe(1);
    await scenario.forceLeaseExpiry(lostLease);

    // A restarted worker resumes from the last committed checkpoint: it
    // re-leases step 1 as a new attempt and commits exactly one checkpoint.
    const restarted = scenario.spawnExecutor();
    try {
      expect(await restarted.executor.runOnce()).toBe(true);
    } finally {
      await restarted.close();
    }

    view = await getJson(scenario, `/api/workflow-runs/${runId}`);
    expect(view.currentStep).toBe(2);
    expect(view.checkpoints.map((c: { stepIndex: number }) => c.stepIndex)).toEqual([0, 1]);
    const stepOneAttempts = view.attempts.filter(
      (a: { stepIndex: number }) => a.stepIndex === 1,
    );
    // Exactly one committed attempt for step 1: resume did not duplicate work.
    expect(stepOneAttempts).toHaveLength(2);
    expect(
      stepOneAttempts.find((a: { attempt: number }) => a.attempt === 1)?.status,
    ).toBe("expired");
    expect(
      stepOneAttempts.find((a: { attempt: number }) => a.attempt === 2)?.status,
    ).toBe("committed");

    // The run now waits at the human gate; a worker cannot advance it.
    expect(await scenario.executor.runOnce()).toBe(false);

    // A human approves the gate through the control plane and the run advances.
    const approve = await postRaw(scenario, `/api/workflow-runs/${runId}/gates/2/decision`, {
      outcome: "approve",
      note: "approved by human",
    });
    expect(approve.status).toBe(200);
    expect((await approve.json()).currentStep).toBe(3);

    // Final work step completes the run.
    expect(await scenario.executor.runOnce()).toBe(true);
    view = await getJson(scenario, `/api/workflow-runs/${runId}`);
    expect(view.status).toBe("completed");
    expect(view.checkpoints.map((c: { stepIndex: number }) => c.stepIndex)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("denies invalid and out-of-turn gate decisions and refuses invalid artifact commits", async () => {
    const workflow = resumeWorkflow();
    await scenario.runs.declare(workflow);
    const run = await scenario.runs.createRun(workflow.workflowId, workflow.version, {
      prompt: "synthetic denial fixture",
    });

    // A schema-invalid artifact cannot be committed for a leased work step.
    const workLease = (await scenario.runs.claimNextStep(run.id))!;
    expect(workLease.stepIndex).toBe(0);
    await expect(
      scenario.runs.commitCheckpoint(run.id, workLease, {
        content: Buffer.from("not-json", "utf8"),
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: { origin: "original-reasoning", detail: "invalid" },
      }),
    ).rejects.toBeInstanceOf(ArtifactValidationError);

    // A stale lease can never commit, even with a valid artifact.
    await scenario.forceLeaseExpiry(workLease);
    await expect(
      scenario.runs.commitCheckpoint(run.id, workLease, {
        content: Buffer.from(JSON.stringify({ summary: "late" }), "utf8"),
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: { origin: "original-reasoning", detail: "stale" },
      }),
    ).rejects.toBeInstanceOf(WorkflowCommitError);

    // Advance the run to the gate through the background worker.
    expect(await scenario.executor.runOnce()).toBe(true);
    expect(await scenario.executor.runOnce()).toBe(true);
    expect((await scenario.runs.view(run.id))?.currentStep).toBe(2);

    // An invalid gate decision is rejected at the control-plane boundary.
    const invalid = await postRaw(scenario, `/api/workflow-runs/${run.id}/gates/2/decision`, {
      outcome: "maybe",
      note: "?",
    });
    expect(invalid.status).toBe(400);

    // A decision against a non-current gate is rejected.
    const stale = await postRaw(scenario, `/api/workflow-runs/${run.id}/gates/0/decision`, {
      outcome: "approve",
      note: "stale",
    });
    expect(stale.status).toBe(409);
  });

  it("records the eligible endpoint and discloses constrained evidence before routed work commits", async () => {
    const workflow = routedWorkflow();
    await scenario.runs.declare(workflow);
    const run = await scenario.runs.createRun(workflow.workflowId, workflow.version, {
      prompt: "synthetic routed fixture",
      evidence: [
        {
          evidenceId: "source-state-eligible",
          policy: { sensitivity: "local-only", rightsBasis: "owned" },
        },
        {
          evidenceId: "source-state-inaccessible",
          policy: { sensitivity: "local-only", rightsBasis: "inaccessible" },
        },
      ],
    });

    expect(await scenario.executor.runOnce()).toBe(true);
    const view = await scenario.runs.view(run.id);

    expect(view?.status).toBe("completed");
    // Policy eligibility was checked before routing: the actual endpoint that
    // would receive content is recorded, local execution is preferred, and the
    // inaccessible evidence is disclosed as omitted rather than silently used.
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
  });

  it("commits a leased step idempotently: re-committing the same attempt duplicates no work", async () => {
    const workflow = singleStepWorkflow();
    await scenario.runs.declare(workflow);
    const run = await scenario.runs.createRun(workflow.workflowId, workflow.version, {
      prompt: "synthetic idempotent fixture",
    });

    const lease = (await scenario.runs.claimNextStep(run.id))!;
    const submission = {
      content: Buffer.from(JSON.stringify({ summary: "produced once" }), "utf8"),
      policy: { sensitivity: "local-only", rightsBasis: "owned" } as const,
      provenance: { origin: "original-reasoning", detail: "idempotent" } as const,
    };

    const first = await scenario.runs.commitCheckpoint(run.id, lease, submission);
    // Retrying the identical committed attempt is a no-op: the durable
    // checkpoint is unchanged and no second attempt is raised.
    const second = await scenario.runs.commitCheckpoint(run.id, lease, submission);
    expect(second).toEqual(first);

    const view = await scenario.runs.view(run.id);
    expect(view?.status).toBe("completed");
    expect(view?.attempts.filter((a) => a.stepIndex === 0)).toHaveLength(1);
    expect(view?.checkpoints).toHaveLength(1);
  });
});

// --- helpers ---------------------------------------------------------------

interface RevisionRequest {
  module: string;
  label: string;
  note: string;
  payload: Record<string, unknown>;
}

function revise(
  scenario: Phase0Scenario,
  recordId: string,
  body: RevisionRequest,
): Promise<Response> {
  return fetch(`${scenario.address}/api/synthetic-records/${recordId}/revisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readRecord(
  scenario: Phase0Scenario,
  recordId: string,
): Promise<{
  id: string;
  ownerModule: string;
  revision: number;
  state: { label: string; payload: Record<string, unknown> };
  history: Array<{ revision: number }>;
  events: Array<{ revision: number }>;
}> {
  const response = await fetch(`${scenario.address}/api/synthetic-records/${recordId}`);
  expect(response.status).toBe(200);
  return response.json();
}

function postRaw(
  scenario: Phase0Scenario,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${scenario.address}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postJson(
  scenario: Phase0Scenario,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return (await postRaw(scenario, path, body)).json();
}

async function getJson(
  scenario: Phase0Scenario,
  path: string,
  // The workflow run view is a broad, well-tested shape; the gate reads a few
  // fields from it and asserts them, so a permissive type keeps the gate terse.
): Promise<Record<string, any>> {
  const response = await fetch(`${scenario.address}${path}`);
  expect(response.status).toBe(200);
  return response.json();
}

function artifactPath(scenario: Phase0Scenario, hash: string): string {
  return join(scenario.root, "artifacts", hash.slice(0, 2), hash);
}

/** A gather → refine → human-gate → publish workflow used for resume evidence. */
function resumeWorkflow(): WorkflowDefinition {
  return {
    workflowId: `gate-resume-${randomUUID().slice(0, 8)}`,
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
        decisionShape: { type: "object", requiredKeys: ["outcome", "note"] },
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
}

/** A single work step used for idempotent-commit evidence. */
function singleStepWorkflow(): WorkflowDefinition {
  return {
    workflowId: `gate-idempotent-${randomUUID().slice(0, 8)}`,
    version: 1,
    steps: [
      {
        kind: "work",
        stepId: "produce",
        artifactShape: { type: "object", requiredKeys: ["summary"] },
        requiredReferences: [],
        budget: { leaseSeconds: 60, maxAttempts: 3 },
      },
    ],
  };
}

/** A single routed work step used for policy-routing evidence. */
function routedWorkflow(): WorkflowDefinition {
  return {
    workflowId: `gate-routing-${randomUUID().slice(0, 8)}`,
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
}
