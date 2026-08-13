import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, lte, sql } from "drizzle-orm";
import type {
  ArtifactMetadata,
  ArtifactReference,
  ArtifactRegistry,
} from "../artifacts/artifact-registry.js";
import { isContentHash } from "../artifacts/file-artifact-store.js";
import { artifacts } from "../artifacts/schema.js";
import type { LirnaDatabase } from "../database/database.js";
import { isRoutingDecision, type RoutingDecision } from "./executor-router.js";
import {
  type ArtifactSubmission,
  assertWorkflowDefinition,
  type GateDecision,
  parseGateDecision,
  type StepBudget,
  type StepDefinition,
  validateArtifactShape,
  type WorkflowDefinition,
  WorkflowDefinitionError,
} from "./workflow-definition.js";
import { isWorkflowInput, type WorkflowInput } from "./workflow-input.js";

export { WorkflowDefinitionError } from "./workflow-definition.js";

import {
  workflowDefinitions,
  workflowHumanGates,
  workflowRoutingDecisions,
  workflowRuns,
  workflowStepAttempts,
} from "./schema.js";

export type RunStatus = "running" | "paused" | "completed" | "failed";
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
  readonly routingDecisions: RoutingDecisionView[];
}

export interface RoutingDecisionView {
  readonly stepIndex: number;
  readonly decision: RoutingDecision;
  readonly recordedAt: string;
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
  constructor(
    private readonly db: LirnaDatabase,
    private readonly registry: ArtifactRegistry,
  ) {}

  /**
   * Declare a versioned typed workflow. Idempotent: re-declaring an identical
   * (workflowId, version) pair is a no-op; the recorded definition is immutable.
   */
  async declare(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    assertWorkflowDefinition(definition);
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ definition: workflowDefinitions.definition })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.workflowId, definition.workflowId),
            eq(workflowDefinitions.version, definition.version),
          ),
        );
      if (existing[0]) {
        const recorded = existing[0].definition;
        assertWorkflowDefinition(recorded);
        if (!sameDefinition(recorded, definition)) {
          throw new WorkflowDefinitionError(
            `Workflow ${definition.workflowId} v${definition.version} is already declared with a different definition`,
          );
        }
        return recorded;
      }
      await tx.insert(workflowDefinitions).values({
        workflowId: definition.workflowId,
        version: definition.version,
        definition,
      });
      return definition;
    });
  }

  async createRun(workflowId: string, version: number, input: WorkflowInput): Promise<RunView> {
    if (!isWorkflowInput(input)) {
      throw new WorkflowDefinitionError("workflow input must contain only JSON values");
    }
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      const declared = await tx
        .select({ workflowId: workflowDefinitions.workflowId })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.workflowId, workflowId),
            eq(workflowDefinitions.version, version),
          ),
        )
        .for("share");
      if (!declared[0]) {
        throw new WorkflowDefinitionError(`Workflow ${workflowId} v${version} is not declared`);
      }
      await tx.insert(workflowRuns).values({
        id,
        workflowId,
        workflowVersion: version,
        status: "running",
        currentStep: 0,
        input,
      });
    });
    const view = await this.view(id);
    if (!view) {
      throw new Error(`Run ${id} vanished after creation`);
    }
    return view;
  }

  async view(runId: string): Promise<RunView | undefined> {
    return this.db.transaction(
      async (tx) => {
        const run = await tx.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
        const row = run[0];
        if (!row) {
          return undefined;
        }
        const defined = await tx
          .select({ definition: workflowDefinitions.definition })
          .from(workflowDefinitions)
          .where(
            and(
              eq(workflowDefinitions.workflowId, row.workflowId),
              eq(workflowDefinitions.version, row.workflowVersion),
            ),
          );
        const definition = defined[0]?.definition;
        if (!definition) {
          throw new Error(
            `Definition ${row.workflowId} v${row.workflowVersion} missing for run ${runId}`,
          );
        }
        assertWorkflowDefinition(definition);
        const attempts = await tx
          .select()
          .from(workflowStepAttempts)
          .where(eq(workflowStepAttempts.runId, runId))
          .orderBy(asc(workflowStepAttempts.stepIndex), asc(workflowStepAttempts.attempt));
        const gates = await tx
          .select()
          .from(workflowHumanGates)
          .where(eq(workflowHumanGates.runId, runId))
          .orderBy(asc(workflowHumanGates.stepIndex));
        const routing = await tx
          .select()
          .from(workflowRoutingDecisions)
          .where(eq(workflowRoutingDecisions.runId, runId))
          .orderBy(asc(workflowRoutingDecisions.stepIndex));
        const databaseTime = await tx.execute<{ now: string | Date }>(sql`select now() as now`);

        const attemptViews = attempts.map(mapAttempt);
        return {
          id: row.id,
          workflowId: row.workflowId,
          workflowVersion: row.workflowVersion,
          status: row.status,
          currentStep: row.currentStep,
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
          gates: gates.map(mapGate),
          budgets: budgetViews(
            definition,
            attemptViews,
            new Date(databaseTime.rows[0]!.now).getTime(),
          ),
          routingDecisions: routing.map((decision) => ({
            stepIndex: decision.stepIndex,
            decision: requireRoutingDecision(decision.decision),
            recordedAt: decision.recordedAt.toISOString(),
          })),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  /**
   * Enumerate the ids of runs that are still running, oldest first. A
   * background worker uses this to find runs whose current step it can lease.
   */
  async listRunningRunIds(): Promise<string[]> {
    const result = await this.db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.status, "running"))
      .orderBy(asc(workflowRuns.createdAt));
    return result.map((row) => row.id);
  }

  /** Record an immutable routing result before a source-bearing step is leased. */
  async recordRoutingDecision(
    runId: string,
    stepIndex: number,
    decision: RoutingDecision,
  ): Promise<RoutingDecision> {
    if (!isRoutingDecision(decision)) {
      throw new WorkflowCommitError("Routing decision is invalid");
    }
    return this.db.transaction(async (tx) => {
      const run = await tx
        .select({ status: workflowRuns.status, currentStep: workflowRuns.currentStep })
        .from(workflowRuns)
        .where(eq(workflowRuns.id, runId))
        .for("update");
      const row = run[0];
      if (!row || row.status !== "running" || row.currentStep !== stepIndex) {
        throw new WorkflowCommitError(
          `Step ${stepIndex} is not runnable for routing on run ${runId}`,
        );
      }
      await tx
        .insert(workflowRoutingDecisions)
        .values({ runId, stepIndex, decision })
        .onConflictDoNothing();
      const existing = await tx
        .select({ decision: workflowRoutingDecisions.decision })
        .from(workflowRoutingDecisions)
        .where(
          and(
            eq(workflowRoutingDecisions.runId, runId),
            eq(workflowRoutingDecisions.stepIndex, stepIndex),
          ),
        );
      const recorded = requireRoutingDecision(existing[0]!.decision);
      if (recorded.outcome === "paused") {
        await tx
          .update(workflowRuns)
          .set({ status: "paused", updatedAt: sql`now()` })
          .where(eq(workflowRuns.id, runId));
      }
      return recorded;
    });
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
    return this.db.transaction(async (tx) => {
      const run = await tx
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, runId))
        .for("update");
      const row = run[0];
      if (!row || row.status !== "running") {
        return undefined;
      }
      const defined = await tx
        .select({ definition: workflowDefinitions.definition })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.workflowId, row.workflowId),
            eq(workflowDefinitions.version, row.workflowVersion),
          ),
        );
      const definition = defined[0]?.definition;
      if (!definition) {
        throw new Error(
          `Definition missing for run ${runId} (${row.workflowId} v${row.workflowVersion})`,
        );
      }
      assertWorkflowDefinition(definition);

      const stepIndex = row.currentStep;
      if (stepIndex >= definition.steps.length) {
        await tx
          .update(workflowRuns)
          .set({ status: "completed", updatedAt: sql`now()` })
          .where(eq(workflowRuns.id, runId));
        return undefined;
      }

      const step = definition.steps[stepIndex];
      if (!step) {
        return undefined;
      }
      if (options.onlyWork && step.kind === "human-gate") {
        return undefined;
      }

      const active = await tx
        .select({ leaseUntil: workflowStepAttempts.leaseUntil })
        .from(workflowStepAttempts)
        .where(
          and(
            eq(workflowStepAttempts.runId, runId),
            eq(workflowStepAttempts.stepIndex, stepIndex),
            eq(workflowStepAttempts.status, "leased"),
            gt(workflowStepAttempts.leaseUntil, sql`now()`),
          ),
        )
        .limit(1);
      if (active[0]) {
        return undefined;
      }

      const spent = await tx
        .select({ count: count() })
        .from(workflowStepAttempts)
        .where(
          and(eq(workflowStepAttempts.runId, runId), eq(workflowStepAttempts.stepIndex, stepIndex)),
        );
      const attemptsUsed = spent[0]?.count ?? 0;
      if (attemptsUsed >= step.budget.maxAttempts) {
        await tx
          .update(workflowRuns)
          .set({ status: "failed", updatedAt: sql`now()` })
          .where(eq(workflowRuns.id, runId));
        return undefined;
      }

      // Mark any stale leases for this step as expired so the attempt history is
      // explicit and inspectable; only then raise the new attempt.
      await tx
        .update(workflowStepAttempts)
        .set({ status: "expired" })
        .where(
          and(
            eq(workflowStepAttempts.runId, runId),
            eq(workflowStepAttempts.stepIndex, stepIndex),
            eq(workflowStepAttempts.status, "leased"),
            lte(workflowStepAttempts.leaseUntil, sql`now()`),
          ),
        );

      const attempt = attemptsUsed + 1;
      const leaseId = randomUUID();
      const inserted = await tx
        .insert(workflowStepAttempts)
        .values({
          runId,
          stepIndex,
          attempt,
          stepId: step.stepId,
          leaseId,
          leaseUntil: sql`now() + ${step.budget.leaseSeconds} * interval '1 second'`,
          status: "leased",
        })
        .returning({ leaseUntil: workflowStepAttempts.leaseUntil });
      const leaseUntil = inserted[0]!.leaseUntil;

      if (step.kind === "human-gate") {
        await tx
          .insert(workflowHumanGates)
          .values({ runId, stepIndex, stepId: step.stepId, status: "pending" })
          .onConflictDoNothing();
      }

      return {
        runId,
        stepIndex,
        stepId: step.stepId,
        stepKind: step.kind,
        attempt,
        leaseId,
        leaseUntil: leaseUntil.toISOString(),
      };
    });
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

    const shape = step.kind === "human-gate" ? step.decisionShape : step.artifactShape;
    const shapeResult = validateArtifactShape(submission.content, shape);
    if (!shapeResult.ok) {
      throw new ArtifactValidationError(shapeResult.reason);
    }
    validateReferences(step, submission.references ?? []);
    await resolveCrossReferences(submission.references ?? [], this.registry);

    const decision: GateDecision | null =
      step.kind === "human-gate" ? parseGateDecision(shapeResult.value) : null;

    const registered: ArtifactMetadata = await this.registry.register({
      content: submission.content,
      policy: submission.policy,
      provenance: submission.provenance,
      references: submission.references as ArtifactReference[] | undefined,
    });

    await this.db.transaction((tx) =>
      this.commitAttempt(tx, runId, lease, step, registered.hash, decision, run.steps.length),
    );

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
    tx: Parameters<Parameters<LirnaDatabase["transaction"]>[0]>[0],
    runId: string,
    lease: StepLease,
    step: StepDefinition,
    artifactHash: string,
    decision: GateDecision | null,
    totalSteps: number,
  ): Promise<void> {
    const run = await tx
      .select({ status: workflowRuns.status, currentStep: workflowRuns.currentStep })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .for("update");
    const runRow = run[0];
    const attempt = await tx
      .select({
        status: workflowStepAttempts.status,
        leaseId: workflowStepAttempts.leaseId,
        leaseActive: sql<boolean>`${workflowStepAttempts.leaseUntil} > now()`,
      })
      .from(workflowStepAttempts)
      .where(
        and(
          eq(workflowStepAttempts.runId, runId),
          eq(workflowStepAttempts.stepIndex, lease.stepIndex),
          eq(workflowStepAttempts.attempt, lease.attempt),
        ),
      )
      .for("update");
    const attemptRow = attempt[0];
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
    if (attemptRow.leaseId !== lease.leaseId) {
      throw new WorkflowCommitError(
        `Lease id does not match attempt ${lease.attempt} of step ${lease.stepIndex} of run ${runId}`,
      );
    }
    if (!attemptRow.leaseActive) {
      throw new WorkflowCommitError(
        `Lease for attempt ${lease.attempt} of step ${lease.stepIndex} of run ${runId} has expired`,
      );
    }
    if (!runRow || runRow.status !== "running") {
      throw new WorkflowCommitError(`Run ${runId} is not running`);
    }
    if (runRow.currentStep !== lease.stepIndex) {
      throw new WorkflowCommitError(
        `Step ${lease.stepIndex} is not the current step of run ${runId} (current ${runRow.currentStep})`,
      );
    }

    const registered = await tx
      .select({ hash: artifacts.hash })
      .from(artifacts)
      .where(eq(artifacts.hash, artifactHash));
    if (!registered[0]) {
      throw new WorkflowCommitError(`Artifact ${artifactHash} is not registered`);
    }
    await tx
      .update(workflowStepAttempts)
      .set({
        status: "committed",
        artifactHash: registered[0].hash,
        committedAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowStepAttempts.runId, runId),
          eq(workflowStepAttempts.stepIndex, lease.stepIndex),
          eq(workflowStepAttempts.attempt, lease.attempt),
        ),
      );

    if (step.kind === "human-gate" && decision) {
      const gateStatus: GateStatus = decision.outcome === "approve" ? "satisfied" : "rejected";
      await tx
        .update(workflowHumanGates)
        .set({ status: gateStatus, decisionHash: artifactHash, decidedAt: sql`now()` })
        .where(
          and(
            eq(workflowHumanGates.runId, runId),
            eq(workflowHumanGates.stepIndex, lease.stepIndex),
          ),
        );
      if (decision.outcome === "reject") {
        await tx
          .update(workflowRuns)
          .set({ status: "failed", updatedAt: sql`now()` })
          .where(eq(workflowRuns.id, runId));
        return;
      }
    }

    const nextStep = lease.stepIndex + 1;
    const completed = nextStep >= totalSteps;
    await tx
      .update(workflowRuns)
      .set({
        currentStep: nextStep,
        status: completed ? "completed" : "running",
        updatedAt: sql`now()`,
      })
      .where(eq(workflowRuns.id, runId));
  }
}

function requireRoutingDecision(value: unknown): RoutingDecision {
  if (!isRoutingDecision(value)) {
    throw new WorkflowCommitError("Persisted routing decision is invalid");
  }
  return value;
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
      throw new ArtifactValidationError(`reference targetId must be a non-empty string`);
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

function mapAttempt(row: typeof workflowStepAttempts.$inferSelect): AttemptView {
  return {
    stepIndex: row.stepIndex,
    stepId: row.stepId,
    attempt: row.attempt,
    status: row.status,
    leaseId: row.leaseId,
    leaseUntil: row.leaseUntil.toISOString(),
    leasedAt: row.leasedAt.toISOString(),
    artifactHash: row.artifactHash,
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
  };
}

function mapGate(row: typeof workflowHumanGates.$inferSelect): GateView {
  return {
    stepIndex: row.stepIndex,
    stepId: row.stepId,
    status: row.status,
    decisionHash: row.decisionHash,
    raisedAt: row.raisedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
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
      (attempt) => attempt.status === "leased" && new Date(attempt.leaseUntil).getTime() > now,
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
