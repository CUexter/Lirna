import type { ArtifactReference } from "../artifacts/artifact-registry.js";
import type { ArtifactSubmission, WorkStepDefinition } from "./workflow-definition.js";
import {
  WorkflowRunRepository,
  type RunView,
  type StepLease,
} from "./workflow-run-repository.js";

/**
 * A background executor for typed workflows. It leases the current work step
 * of any running run, produces a deterministic synthetic artifact from the
 * run input and the committed checkpoints behind it, and commits the durable
 * checkpoint. Human gates are skipped: a worker never leases a gate step, so
 * the gate stays open for a human decision through the control plane.
 *
 * Worker loss is bounded by the step's lease: if this process dies after
 * leasing but before committing, the lease expires and another worker (or this
 * one, restarted) raises a new attempt and resumes from the last committed
 * checkpoint.
 */
export class WorkflowExecutor {
  constructor(private readonly runs: WorkflowRunRepository) {}

  /**
   * Claim and execute one work step of one running run. Returns true when a
   * step was leased and committed, false when no runnable work step exists.
   */
  async runOnce(): Promise<boolean> {
    const runIds = await this.runs.listRunningRunIds();
    for (const runId of runIds) {
      const lease = await this.runs.claimNextStep(runId, { onlyWork: true });
      if (!lease) {
        continue;
      }
      const view = await this.runs.view(runId);
      if (!view) {
        continue;
      }
      const submission = this.produceSubmission(view, lease);
      await this.runs.commitCheckpoint(runId, lease, submission);
      return true;
    }
    return false;
  }

  /**
   * Produce a deterministic, schema-valid artifact for one leased work step.
   * The content summarizes the run input and the step; when the step declares
   * required derivative references, the artifact references the immediately
   * preceding committed checkpoint so reference-validity is satisfiable.
   */
  private produceSubmission(view: RunView, lease: StepLease): ArtifactSubmission {
    const step = view.steps[lease.stepIndex] as WorkStepDefinition | undefined;
    if (!step || step.kind !== "work") {
      throw new Error(
        `Leased step ${lease.stepIndex} of run ${lease.runId} is not a work step`,
      );
    }
    const prompt =
      typeof view.input.prompt === "string" ? view.input.prompt : "synthetic";
    const summary = `${step.stepId} of ${prompt}`;
    const content = Buffer.from(JSON.stringify({ summary }), "utf8");

    const references: ArtifactReference[] = [];
    if (step.requiredReferences.some((req) => req.kind === "derivative")) {
      const previous = view.checkpoints[view.checkpoints.length - 1];
      if (previous) {
        references.push({ kind: "derivative", targetId: previous.artifactHash });
      }
    }

    return {
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: {
        origin: "original-reasoning",
        detail: `synthetic workflow step ${step.stepId}`,
      },
      references,
    };
  }
}
