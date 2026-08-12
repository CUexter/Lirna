import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  ArtifactRegistry,
  type ArtifactMetadata,
  type ArtifactReference,
} from "../artifacts/artifact-registry.js";
import { isContentHash } from "../artifacts/file-artifact-store.js";
import {
  parseGateDecision,
  validateArtifactShape,
  type ArtifactSubmission,
  type GateDecision,
  type StepBudget,
  type StepDefinition,
  type WorkflowDefinition,
} from "./workflow-definition.js";

const { Pool } = pg;

export type RunStatus = "running" | "completed" | "failed";
export type AttemptStatus = "leased" | "committed" | "expired";
export type GateStatus = "pending" | "satisfied" | "rejected";

/** A leased step returned to a worker or a human gate-keeper. */
export interface StepLease {
  readonly runId: string;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly stepKind: StepDefinition["kind"];
  readonly attempt: number;
  readonly leaseId: string;
  readonly leaseUntil: string;
}

/** One committed checkpoint: a step's accepted artifact. */
export interface CheckpointView {
  readonly runId: string;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly attempt: number;
  readonly artifactHash: string;
  readonly committedAt: string;
}

export interface AttemptView {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly attempt: number;
  readonly status: AttemptStatus;
  readonly leaseId: string;
  readonly leaseUntil: string;
  readonly leasedAt: string;
  readonly artifactHash: string | null;
  readonly committedAt: string | null;
}

export interface GateView {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly status: GateStatus;
  readonly decisionHash: string | null;
  readonly raisedAt: string;
  readonly decidedAt: string | null;
}

export interface StepBudgetView {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly budget: StepBudget;
  readonly attemptsUsed: number;
  readonly activeLease: boolean;
}

export interface RunView {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowVersion: number;
  readonly status: RunStatus;
  readonly currentStep: number;
  readonly input: Record<string, unknown>;
  readonly steps: ReadonlyArray<StepDefinition>;
  readonly attempts: AttemptView[];
  readonly checkpoints: CheckpointView[];
  readonly gates: GateView[];
  readonly budgets: StepBudgetView[];
}

/** Raised when a commit violates artifact schema or reference requirements. */
export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactValidationError";
  }
}

/** Raised when a commit is not workflow-valid: stale lease, wrong step, etc. */
export class WorkflowCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowCommitError";
  }
}

/** Raised when a workflow definition is not declarable. */
export class WorkflowDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowDefinitionError";
  }
}

interface RunRow {
  id: string;
  workflow_id: string;
  workflow_version: number;
  status: RunStatus;
  current_step: number;
  input: Record<string, unknown>;
}

interface AttemptRow {
  step_index: number;
  step_id: string;
  attempt: number;
  status: AttemptStatus;
  lease_id: string;
  lease_until: Date;
  leased_at: Date;
  artifact_hash: string | null;
  committed_at: Date | null;
}

interface GateRow {
  step_index: number;
  step_id: string;
  status: GateStatus;
  decision_hash: string | null;
  raised_at: Date;
  decided_at: Date | null;
}

/**
 * Owns durable workflow run state: versions, attempts, leases, checkpoints,
 * budgets, and declared human gates. Workers lease idempotent steps and may
 * commit only schema-valid, reference-valid, workflow-valid artifacts; resume
 * begins at the last committed checkpoint (`current_step`), not at zero.
 *
 * Artifact bytes and their authoritative metadata live in the ArtifactRegistry
 * (content-addressed); the repository records which committed artifact is each
 * step's checkpoint. Registering the artifact is idempotent, so a commit that
 * fails the workflow-valid checks leaves no duplicate identity behind.
 */
export class WorkflowRunRepository {
  private readonly pool: pg.Pool;

  constructor(
    databaseUrl: string,
    private readonly registry: ArtifactRegistry,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Declare a versioned typed workflow. Idempotent: re-declaring an identical
   * (workflowId, version) pair is a no-op; the recorded definition is immutable.
   */
  async declare(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    assertDefinition(definition);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ definition: WorkflowDefinition }>(
        `SELECT definition FROM workflow_definitions
          WHERE workflow_id = $1 AND version = $2`,
        [definition.workflowId, definition.version],
      );
      if (existing.rows[0]) {
        const recorded = existing.rows[0].definition;
        if (!sameDefinition(recorded, definition)) {
          throw new WorkflowDefinitionError(
            `Workflow ${definition.workflowId} v${definition.version} is already declared with a different definition`,
          );
        }
        await client.query("COMMIT");
        return recorded;
      }
      await client.query(
        `INSERT INTO workflow_definitions (workflow_id, version, definition)
         VALUES ($1, $2, $3)`,
        [definition.workflowId, definition.version, definition],
      );
      await client.query("COMMIT");
      return definition;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createRun(
    workflowId: string,
    version: number,
    input: Record<string, unknown>,
  ): Promise<RunView> {
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const declared = await client.query(
        `SELECT 1 FROM workflow_definitions
          WHERE workflow_id = $1 AND version = $2
          FOR SHARE`,
        [workflowId, version],
      );
      if (!declared.rows[0]) {
        throw new WorkflowDefinitionError(
          `Workflow ${workflowId} v${version} is not declared`,
        );
      }
      await client.query(
        `INSERT INTO workflow_runs (id, workflow_id, workflow_version, status, current_step, input)
         VALUES ($1, $2, $3, 'running', 0, $4)`,
        [id, workflowId, version, input],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const view = await this.view(id);
    if (!view) {
      throw new Error(`Run ${id} vanished after creation`);
    }
    return view;
  }

  async view(runId: string): Promise<RunView | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const run = await client.query<RunRow>(
        `SELECT id, workflow_id, workflow_version, status, current_step, input
           FROM workflow_runs WHERE id = $1`,
        [runId],
      );
      const row = run.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return undefined;
      }
      const defined = await client.query<{ definition: WorkflowDefinition }>(
        `SELECT definition FROM workflow_definitions
          WHERE workflow_id = $1 AND version = $2`,
        [row.workflow_id, row.workflow_version],
      );
      const definition = defined.rows[0]?.definition;
      if (!definition) {
        throw new Error(
          `Definition ${row.workflow_id} v${row.workflow_version} missing for run ${runId}`,
        );
      }
      const attempts = await client.query<AttemptRow>(
        `SELECT step_index, step_id, attempt, status, lease_id, lease_until,
                leased_at, artifact_hash, committed_at
           FROM workflow_step_attempts
          WHERE run_id = $1
          ORDER BY step_index, attempt`,
        [runId],
      );
      const gates = await client.query<GateRow>(
        `SELECT step_index, step_id, status, decision_hash, raised_at, decided_at
           FROM workflow_human_gates
          WHERE run_id = $1
          ORDER BY step_index`,
        [runId],
      );
      const databaseTime = await client.query<{ now: Date }>("SELECT now()");
      await client.query("COMMIT");

      const attemptViews = attempts.rows.map(mapAttempt);
      return {
        id: row.id,
        workflowId: row.workflow_id,
        workflowVersion: row.workflow_version,
        status: row.status,
        currentStep: row.current_step,
        input: row.input,
        steps: definition.steps,
        attempts: attemptViews,
        checkpoints: attemptViews
          .filter((attempt) => attempt.status === "committed")
          .map((attempt) => ({
            runId,
            stepIndex: attempt.stepIndex,
            stepId: attempt.stepId,
            attempt: attempt.attempt,
            artifactHash: attempt.artifactHash!,
            committedAt: attempt.committedAt!,
          })),
        gates: gates.rows.map(mapGate),
        budgets: budgetViews(
          definition,
          attemptViews,
          databaseTime.rows[0]!.now.getTime(),
        ),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enumerate the ids of runs that are still running, oldest first. A
   * background worker uses this to find runs whose current step it can lease.
   */
  async listRunningRunIds(): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM workflow_runs WHERE status = 'running' ORDER BY created_at`,
    );
    return result.rows.map((row) => row.id);
  }

  /**
   * Lease the run's current step to a worker (or a human gate-keeper). Returns
   * undefined when the run is not running, the current step already has an
   * active lease, or the step's attempt budget is exhausted (which fails the
   * run). Lease expiry or worker loss raises a new attempt; a stale lease can
   * never commit.
   *
   * `onlyWork` skips human-gate steps: a background worker leases only work
   * steps and leaves gate steps for a human decision through the control plane.
   */
  async claimNextStep(
    runId: string,
    options: { onlyWork?: boolean } = {},
  ): Promise<StepLease | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const run = await client.query<RunRow>(
        `SELECT id, workflow_id, workflow_version, status, current_step, input
           FROM workflow_runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const row = run.rows[0];
      if (!row || row.status !== "running") {
        await client.query("COMMIT");
        return undefined;
      }
      const defined = await client.query<{ definition: WorkflowDefinition }>(
        `SELECT definition FROM workflow_definitions
          WHERE workflow_id = $1 AND version = $2`,
        [row.workflow_id, row.workflow_version],
      );
      const definition = defined.rows[0]?.definition;
      if (!definition) {
        throw new Error(
          `Definition missing for run ${runId} (${row.workflow_id} v${row.workflow_version})`,
        );
      }

      const stepIndex = row.current_step;
      if (stepIndex >= definition.steps.length) {
        await client.query(
          `UPDATE workflow_runs SET status = 'completed', updated_at = now() WHERE id = $1`,
          [runId],
        );
        await client.query("COMMIT");
        return undefined;
      }

      const step = definition.steps[stepIndex];
      if (!step) {
        await client.query("COMMIT");
        return undefined;
      }
      if (options.onlyWork && step.kind === "human-gate") {
        await client.query("COMMIT");
        return undefined;
      }

      const active = await client.query<{ lease_until: Date }>(
        `SELECT lease_until FROM workflow_step_attempts
          WHERE run_id = $1 AND step_index = $2 AND status = 'leased'
            AND lease_until > now()
          LIMIT 1`,
        [runId, stepIndex],
      );
      if (active.rows[0]) {
        await client.query("COMMIT");
        return undefined;
      }

      const spent = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workflow_step_attempts
          WHERE run_id = $1 AND step_index = $2`,
        [runId, stepIndex],
      );
      const attemptsUsed = Number(spent.rows[0]?.count ?? "0");
      if (attemptsUsed >= step.budget.maxAttempts) {
        await client.query(
          `UPDATE workflow_runs SET status = 'failed', updated_at = now() WHERE id = $1`,
          [runId],
        );
        await client.query("COMMIT");
        return undefined;
      }

      // Mark any stale leases for this step as expired so the attempt history is
      // explicit and inspectable; only then raise the new attempt.
      await client.query(
        `UPDATE workflow_step_attempts
            SET status = 'expired'
          WHERE run_id = $1 AND step_index = $2 AND status = 'leased'
            AND lease_until <= now()`,
        [runId, stepIndex],
      );

      const attempt = attemptsUsed + 1;
      const leaseId = randomUUID();
      const inserted = await client.query<{ lease_until: Date }>(
        `INSERT INTO workflow_step_attempts
           (run_id, step_index, attempt, step_id, lease_id, lease_until, status)
         VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 second', 'leased')
         RETURNING lease_until`,
        [runId, stepIndex, attempt, step.stepId, leaseId, step.budget.leaseSeconds],
      );
      const leaseUntil = inserted.rows[0]!.lease_until;

      if (step.kind === "human-gate") {
        await client.query(
          `INSERT INTO workflow_human_gates
             (run_id, step_index, step_id, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (run_id, step_index) DO NOTHING`,
          [runId, stepIndex, step.stepId],
        );
      }

      await client.query("COMMIT");
      return {
        runId,
        stepIndex,
        stepId: step.stepId,
        stepKind: step.kind,
        attempt,
        leaseId,
        leaseUntil: leaseUntil.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Commit one step's validated artifact as the durable checkpoint for the
   * leased attempt. The artifact is registered (content-addressed) first; the
   * checkpoint transaction then verifies the lease is still the active lease
   * for the run's current step and advances the run. A stale or expired lease
   * cannot commit, so worker loss never duplicates committed work.
   */
  async commitCheckpoint(
    runId: string,
    lease: StepLease,
    submission: ArtifactSubmission,
  ): Promise<CheckpointView> {
    const run = await this.view(runId);
    if (!run) {
      throw new WorkflowCommitError(`Run ${runId} not found`);
    }
    const step = run.steps[lease.stepIndex];
    if (!step) {
      throw new WorkflowCommitError(
        `Step ${lease.stepIndex} is not declared by ${run.workflowId} v${run.workflowVersion}`,
      );
    }

    const shape =
      step.kind === "human-gate" ? step.decisionShape : step.artifactShape;
    const shapeResult = validateArtifactShape(submission.content, shape);
    if (!shapeResult.ok) {
      throw new ArtifactValidationError(shapeResult.reason);
    }
    validateReferences(step, submission.references ?? []);
    await resolveCrossReferences(submission.references ?? [], this.registry);

    const decision: GateDecision | null =
      step.kind === "human-gate"
        ? parseGateDecision(shapeResult.value)
        : null;

    const registered: ArtifactMetadata = await this.registry.register({
      content: submission.content,
      policy: submission.policy,
      provenance: submission.provenance,
      references: submission.references as ArtifactReference[] | undefined,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.commitAttempt(client, runId, lease, step, registered.hash, decision, run.steps.length);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const view = await this.view(runId);
    const checkpoint = view?.checkpoints.find((c) => c.stepIndex === lease.stepIndex);
    if (!checkpoint) {
      throw new Error(
        `Checkpoint for step ${lease.stepIndex} of run ${runId} missing after commit`,
      );
    }
    return checkpoint;
  }

  private async commitAttempt(
    client: pg.PoolClient,
    runId: string,
    lease: StepLease,
    step: StepDefinition,
    artifactHash: string,
    decision: GateDecision | null,
    totalSteps: number,
  ): Promise<void> {
    const run = await client.query<{ status: RunStatus; current_step: number }>(
      `SELECT status, current_step FROM workflow_runs WHERE id = $1 FOR UPDATE`,
      [runId],
    );
    const runRow = run.rows[0];
    const attempt = await client.query<{
      status: AttemptStatus;
      lease_id: string;
      lease_active: boolean;
    }>(
      `SELECT status, lease_id, lease_until > now() AS lease_active
         FROM workflow_step_attempts
        WHERE run_id = $1 AND step_index = $2 AND attempt = $3 FOR UPDATE`,
      [runId, lease.stepIndex, lease.attempt],
    );
    const attemptRow = attempt.rows[0];
    if (!attemptRow) {
      throw new WorkflowCommitError(
        `Attempt ${lease.attempt} for step ${lease.stepIndex} of run ${runId} not found`,
      );
    }
    // Idempotent re-commit of the same (already committed) attempt: the
    // durable checkpoint is unchanged whether or not the run has advanced.
    if (attemptRow.status === "committed") {
      return;
    }
    if (attemptRow.status !== "leased") {
      throw new WorkflowCommitError(
        `Attempt ${lease.attempt} for step ${lease.stepIndex} of run ${runId} is ${attemptRow.status}`,
      );
    }
    if (attemptRow.lease_id !== lease.leaseId) {
      throw new WorkflowCommitError(
        `Lease id does not match attempt ${lease.attempt} of step ${lease.stepIndex} of run ${runId}`,
      );
    }
    if (!attemptRow.lease_active) {
      throw new WorkflowCommitError(
        `Lease for attempt ${lease.attempt} of step ${lease.stepIndex} of run ${runId} has expired`,
      );
    }
    if (!runRow || runRow.status !== "running") {
      throw new WorkflowCommitError(`Run ${runId} is not running`);
    }
    if (runRow.current_step !== lease.stepIndex) {
      throw new WorkflowCommitError(
        `Step ${lease.stepIndex} is not the current step of run ${runId} (current ${runRow.current_step})`,
      );
    }

    await client.query(
      `UPDATE workflow_step_attempts
         SET status = 'committed', artifact_hash = $3, committed_at = now()
       WHERE run_id = $1 AND step_index = $2 AND attempt = $4`,
      [runId, lease.stepIndex, artifactHash, lease.attempt],
    );

    if (step.kind === "human-gate" && decision) {
      const gateStatus: GateStatus =
        decision.outcome === "approve" ? "satisfied" : "rejected";
      await client.query(
        `UPDATE workflow_human_gates
           SET status = $3, decision_hash = $4, decided_at = now()
         WHERE run_id = $1 AND step_index = $2`,
        [runId, lease.stepIndex, gateStatus, artifactHash],
      );
      if (decision.outcome === "reject") {
        await client.query(
          `UPDATE workflow_runs SET status = 'failed', updated_at = now() WHERE id = $1`,
          [runId],
        );
        return;
      }
    }

    const nextStep = lease.stepIndex + 1;
    const completed = nextStep >= totalSteps;
    await client.query(
      `UPDATE workflow_runs
         SET current_step = $2, status = $3, updated_at = now()
       WHERE id = $1`,
      [runId, nextStep, completed ? "completed" : "running"],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function assertDefinition(definition: WorkflowDefinition): void {
  if (!isRecord(definition)) {
    throw new WorkflowDefinitionError("workflow definition must be an object");
  }
  if (
    typeof definition.workflowId !== "string" ||
    definition.workflowId.length === 0 ||
    definition.workflowId.length > 80
  ) {
    throw new WorkflowDefinitionError("workflowId must be a non-empty string");
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new WorkflowDefinitionError("version must be a positive integer");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new WorkflowDefinitionError("a workflow must declare at least one step");
  }
  const stepIds = new Set<string>();
  for (const [index, candidate] of definition.steps.entries()) {
    if (!isRecord(candidate)) {
      throw new WorkflowDefinitionError(`step ${index} must be an object`);
    }
    const step = candidate as unknown as Record<string, unknown>;
    if (
      typeof step.stepId !== "string" ||
      step.stepId.length === 0 ||
      step.stepId.length > 80
    ) {
      throw new WorkflowDefinitionError("each step requires a non-empty stepId");
    }
    if (stepIds.has(step.stepId)) {
      throw new WorkflowDefinitionError(`duplicate stepId "${step.stepId}"`);
    }
    stepIds.add(step.stepId);
    if (!isRecord(step.budget)) {
      throw new WorkflowDefinitionError(`step "${step.stepId}" requires a budget`);
    }
    if (!isPositiveInteger(step.budget.leaseSeconds)) {
      throw new WorkflowDefinitionError(
        `step "${step.stepId}" requires a positive integer leaseSeconds`,
      );
    }
    if (!isPositiveInteger(step.budget.maxAttempts)) {
      throw new WorkflowDefinitionError(
        `step "${step.stepId}" requires a positive integer maxAttempts`,
      );
    }
    if (step.kind === "work") {
      assertArtifactShape(step.artifactShape, step.stepId, "artifactShape");
      if (!Array.isArray(step.requiredReferences)) {
        throw new WorkflowDefinitionError(
          `work step "${step.stepId}" requires requiredReferences`,
        );
      }
      for (const required of step.requiredReferences) {
        if (
          !isRecord(required) ||
          !isReferenceKind(required.kind) ||
          !Number.isInteger(required.min) ||
          (required.min as number) < 0
        ) {
          throw new WorkflowDefinitionError(
            `work step "${step.stepId}" has an invalid required reference`,
          );
        }
      }
    } else if (step.kind === "human-gate") {
      if (typeof step.prompt !== "string" || step.prompt.length === 0) {
        throw new WorkflowDefinitionError(
          `human gate "${step.stepId}" requires a non-empty prompt`,
        );
      }
      assertArtifactShape(step.decisionShape, step.stepId, "decisionShape");
    } else {
      throw new WorkflowDefinitionError(
        `step "${step.stepId}" has unsupported kind "${String(step.kind)}"`,
      );
    }
  }
}

function assertArtifactShape(
  candidate: unknown,
  stepId: string,
  field: "artifactShape" | "decisionShape",
): void {
  if (!isRecord(candidate) || (candidate.type !== "object" && candidate.type !== "string")) {
    throw new WorkflowDefinitionError(
      `step "${stepId}" ${field} must declare type "object" or "string"`,
    );
  }
  if (
    candidate.requiredKeys !== undefined &&
    (!Array.isArray(candidate.requiredKeys) ||
      candidate.requiredKeys.some(
        (key) => typeof key !== "string" || key.length === 0,
      ))
  ) {
    throw new WorkflowDefinitionError(
      `step "${stepId}" ${field} requiredKeys must be non-empty strings`,
    );
  }
  if (candidate.type === "string" && candidate.requiredKeys !== undefined) {
    throw new WorkflowDefinitionError(
      `step "${stepId}" ${field} cannot declare requiredKeys for a string`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isReferenceKind(value: unknown): value is ArtifactReference["kind"] {
  return (
    value === "source" ||
    value === "owned-note" ||
    value === "rendition" ||
    value === "derivative"
  );
}

function sameDefinition(a: WorkflowDefinition, b: WorkflowDefinition): boolean {
  return stableJson(a) === stableJson(b);
}

/**
 * Canonical JSON for structural comparison. PostgreSQL's jsonb stores parsed
 * JSON and may reorder object keys on round-trip, so a raw `JSON.stringify`
 * comparison would falsely report an identical re-declaration as different.
 * This sorts object keys recursively so the comparison is order-independent.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

function validateReferences(
  step: StepDefinition,
  references: ReadonlyArray<ArtifactReference>,
): void {
  if (step.kind === "human-gate") {
    return;
  }
  for (const required of step.requiredReferences) {
    const count = references.filter((ref) => ref.kind === required.kind).length;
    if (count < required.min) {
      throw new ArtifactValidationError(
        `step "${step.stepId}" requires at least ${required.min} ${required.kind} reference(s); got ${count}`,
      );
    }
  }
  for (const ref of references) {
    if (
      typeof ref.targetId !== "string" ||
      ref.targetId.length === 0 ||
      ref.targetId.length > 200
    ) {
      throw new ArtifactValidationError(
        `reference targetId must be a non-empty string`,
      );
    }
  }
}

/**
 * Reference-validity for content-addressed references: a `rendition` or
 * `derivative` reference must resolve to a registered artifact. `source` and
 * `owned-note` references name domain objects outside the artifact registry
 * and are structurally validated only.
 */
async function resolveCrossReferences(
  references: ReadonlyArray<ArtifactReference>,
  registry: ArtifactRegistry,
): Promise<void> {
  for (const ref of references) {
    if (ref.kind !== "rendition" && ref.kind !== "derivative") {
      continue;
    }
    if (!isContentHash(ref.targetId)) {
      throw new ArtifactValidationError(
        `${ref.kind} reference targetId "${ref.targetId}" is not a content hash`,
      );
    }
    const existing = await registry.view(ref.targetId);
    if (!existing) {
      throw new ArtifactValidationError(
        `${ref.kind} reference "${ref.targetId}" does not resolve to a registered artifact`,
      );
    }
  }
}

function mapAttempt(row: AttemptRow): AttemptView {
  return {
    stepIndex: row.step_index,
    stepId: row.step_id,
    attempt: row.attempt,
    status: row.status,
    leaseId: row.lease_id,
    leaseUntil: row.lease_until.toISOString(),
    leasedAt: row.leased_at.toISOString(),
    artifactHash: row.artifact_hash,
    committedAt: row.committed_at ? row.committed_at.toISOString() : null,
  };
}

function mapGate(row: GateRow): GateView {
  return {
    stepIndex: row.step_index,
    stepId: row.step_id,
    status: row.status,
    decisionHash: row.decision_hash,
    raisedAt: row.raised_at.toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  };
}

function budgetViews(
  definition: WorkflowDefinition,
  attempts: AttemptView[],
  now: number,
): StepBudgetView[] {
  return definition.steps.map((step, index) => {
    const forStep = attempts.filter((attempt) => attempt.stepIndex === index);
    const activeLease = forStep.some(
      (attempt) =>
        attempt.status === "leased" &&
        new Date(attempt.leaseUntil).getTime() > now,
    );
    return {
      stepIndex: index,
      stepId: step.stepId,
      budget: step.budget,
      attemptsUsed: forStep.length,
      activeLease,
    };
  });
}
