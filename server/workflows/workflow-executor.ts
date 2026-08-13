import type { ArtifactReference } from "../artifacts/artifact-registry.js";
import {
  type ExecutorProfile,
  isSourceHandlingPolicy,
  PolicyAwareExecutorRouter,
  type RetrievedEvidence,
  type RoutingDecision,
  type SourceEvidence,
} from "./executor-router.js";
import type { ArtifactSubmission, WorkStepDefinition } from "./workflow-definition.js";
import type { RunView, StepLease, WorkflowRunRepository } from "./workflow-run-repository.js";

export interface ExecutorAdapter extends ExecutorProfile {
  execute(command: {
    readonly view: RunView;
    readonly lease: StepLease;
    readonly evidence: ReadonlyArray<RetrievedEvidence>;
  }): Promise<ArtifactSubmission>;
}

/** The outcome of preparing a run's current step for execution. */
type StepPreparation =
  | { readonly outcome: "recorded-pause" }
  | {
      readonly outcome: "ready";
      readonly retrieved: RetrievedEvidence[];
      readonly routableEvidence: SourceEvidence[];
    };

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
  constructor(
    private readonly runs: WorkflowRunRepository,
    private readonly executors: ReadonlyArray<ExecutorAdapter> = [
      {
        executorId: "local-synthetic",
        endpoint: "local://synthetic",
        location: "local",
        capabilities: ["synthetic"],
        quality: 100,
        available: true,
        latencyMs: 0,
        cost: 0,
        restrictedCloudEligible: false,
        execute: async ({ view, lease }) => this.produceSubmission(view, lease),
      },
    ],
    private readonly retrieveEvidence: (
      evidence: SourceEvidence,
    ) => Promise<RetrievedEvidence> = async (evidence) => ({
      ...evidence,
      content: Buffer.alloc(0),
    }),
    private readonly router = new PolicyAwareExecutorRouter(),
  ) {}

  /**
   * Claim and execute one work step of one running run. Returns true when a
   * step was leased and committed, false when no runnable work step exists.
   */
  async runOnce(): Promise<boolean> {
    for (const runId of await this.runs.listRunningRunIds()) {
      if (await this.runStep(runId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Advance one running run by at most one step. Returns true when this run
   * consumed the iteration's work — a committed checkpoint or a newly recorded
   * routing pause — and false when the run has nothing runnable and the
   * executor should move on to the next run.
   */
  private async runStep(runId: string): Promise<boolean> {
    const beforeLease = await this.runs.view(runId);
    if (!beforeLease) {
      return false;
    }
    const current = beforeLease.steps[beforeLease.currentStep];
    const recordedRoute = beforeLease.routingDecisions.find(
      (recorded) => recorded.stepIndex === beforeLease.currentStep,
    );
    if (recordedRoute?.decision.outcome === "paused") {
      return false;
    }

    const preparation = await this.prepareWorkStep(runId, beforeLease, current, recordedRoute);
    if (preparation.outcome === "recorded-pause") {
      return true;
    }

    const lease = await this.runs.claimNextStep(runId, { onlyWork: true });
    if (!lease) {
      return false;
    }
    const view = await this.runs.view(runId);
    if (!view) {
      return false;
    }
    // Reuse the freshly leased view rather than re-reading the run a third time.
    const route =
      recordedRoute?.decision ??
      view.routingDecisions.find((recorded) => recorded.stepIndex === lease.stepIndex)?.decision;
    const adapter = this.resolveAdapter(route, current, preparation.routableEvidence);

    const submission = adapter
      ? await adapter.execute({ view, lease, evidence: preparation.retrieved })
      : this.produceSubmission(view, lease);
    await this.runs.commitCheckpoint(runId, lease, submission);
    return true;
  }

  /**
   * Retrieve policy-eligible evidence and, on first sight of a routing work
   * step, record its routing decision. Returns "recorded-pause" when routing
   * paused the run (invalid evidence or no eligible executor), otherwise the
   * evidence the leased step will execute against.
   */
  private async prepareWorkStep(
    runId: string,
    view: RunView,
    current: RunView["steps"][number] | undefined,
    recordedRoute: RunView["routingDecisions"][number] | undefined,
  ): Promise<StepPreparation> {
    if (!(current?.kind === "work" && current.routing)) {
      return { outcome: "ready", retrieved: [], routableEvidence: [] };
    }
    let evidence: SourceEvidence[];
    try {
      evidence = parseEvidence(view.input.evidence);
    } catch (error) {
      await this.runs.recordRoutingDecision(runId, view.currentStep, {
        outcome: "paused",
        reason: "Workflow evidence has an invalid Source handling policy",
        choices: [],
        disclosedEvidence: [],
        omittedEvidence: [
          {
            evidenceId: "invalid-workflow-evidence",
            reason: error instanceof Error ? error.message : "invalid evidence",
          },
        ],
      });
      return { outcome: "recorded-pause" };
    }
    const retrieval = this.router.prepareRetrieval(evidence, this.executors);
    if (!recordedRoute) {
      const decision = this.router.route({
        evidence: retrieval.eligible,
        executors: this.executors,
        requirements: current.routing,
        omittedEvidence: retrieval.omitted,
      });
      const recorded = await this.runs.recordRoutingDecision(runId, view.currentStep, decision);
      if (recorded.outcome === "paused") {
        return { outcome: "recorded-pause" };
      }
    }
    const retrieved = await Promise.all(retrieval.eligible.map(this.retrieveEvidence));
    return { outcome: "ready", retrieved, routableEvidence: retrieval.eligible };
  }

  /**
   * Resolve the configured adapter for a routing decision and re-check, against
   * the actually leased step, that the selected executor is still eligible.
   * Throws when the selection is unconfigured or no longer eligible; returns
   * undefined for steps that route to the default synthetic executor.
   */
  private resolveAdapter(
    route: RoutingDecision | undefined,
    current: RunView["steps"][number] | undefined,
    routableEvidence: ReadonlyArray<SourceEvidence>,
  ): ExecutorAdapter | undefined {
    const adapter =
      route?.outcome === "selected"
        ? this.executors.find(
            (executor) =>
              executor.executorId === route.executorId && executor.endpoint === route.endpoint,
          )
        : undefined;
    if (route?.outcome === "selected" && !adapter) {
      throw new Error(
        `Selected executor ${route.executorId} at ${route.endpoint} is not configured`,
      );
    }
    if (adapter && current?.kind === "work" && current.routing) {
      const { preferredExecutorId: _preferredExecutorId, ...eligibilityRequirements } =
        current.routing;
      const eligibility = this.router.route({
        evidence: [...routableEvidence],
        executors: [adapter],
        requirements: eligibilityRequirements,
        omittedEvidence: [],
      });
      if (eligibility.outcome !== "selected" || eligibility.executorId !== adapter.executorId) {
        throw new Error(`Selected executor ${adapter.executorId} is no longer eligible`);
      }
    }
    return adapter;
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
      throw new Error(`Leased step ${lease.stepIndex} of run ${lease.runId} is not a work step`);
    }
    const prompt = typeof view.input.prompt === "string" ? view.input.prompt : "synthetic";
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

function parseEvidence(value: unknown): SourceEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item): SourceEvidence => {
    if (item === null || typeof item !== "object") {
      throw new Error("workflow evidence must be an object");
    }
    const candidate = item as Partial<SourceEvidence>;
    if (typeof candidate.evidenceId !== "string" || !isSourceHandlingPolicy(candidate.policy)) {
      throw new Error("workflow evidence requires a valid id and Source handling policy");
    }
    return { evidenceId: candidate.evidenceId, policy: candidate.policy };
  });
}
