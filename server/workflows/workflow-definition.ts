import type {
  ArtifactReference,
  Provenance,
  SourceHandlingPolicy,
} from "../artifacts/artifact-registry.js";
import { isRoutingRequirements, type RoutingRequirements } from "./executor-router.js";

export class WorkflowDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowDefinitionError";
  }
}

/**
 * A declared shape a step's committed artifact content must conform to. The
 * validator is intentionally minimal: it proves schema-validity as a
 * workflow concern without importing a JSON-schema dependency. A materially
 * different validation contract is a new workflow version.
 */
export interface ArtifactShape {
  readonly type: "object" | "string";
  readonly requiredKeys?: ReadonlyArray<string>;
}

/**
 * A work step is executed by a leased worker. The worker may commit only an
 * artifact that is schema-valid (matches `artifactShape`), reference-valid
 * (satisfies `requiredReferences`), and workflow-valid (the step is current,
 * the lease is active, and the attempt matches).
 */
export interface WorkStepDefinition {
  readonly kind: "work";
  readonly stepId: string;
  readonly artifactShape: ArtifactShape;
  readonly requiredReferences: ReadonlyArray<{
    readonly kind: ArtifactReference["kind"];
    readonly min: number;
  }>;
  readonly routing?: RoutingRequirements;
  readonly budget: StepBudget;
}

/**
 * A human gate is a declared point at which a worker cannot advance the run.
 * The gate is satisfied by a human-authored decision artifact; the lease model
 * is uniform with work steps so the gate is durable and inspectable like any
 * other checkpoint. `reject` fails the run; `approve` advances it.
 */
export interface GateStepDefinition {
  readonly kind: "human-gate";
  readonly stepId: string;
  readonly prompt: string;
  readonly decisionShape: ArtifactShape;
  readonly budget: StepBudget;
}

export type StepDefinition = WorkStepDefinition | GateStepDefinition;

/**
 * Per-step execution budget. `leaseSeconds` bounds one lease; `maxAttempts`
 * bounds how many leases may be raised for one step before the run fails.
 * Both are durable and inspectable through the recorded attempts.
 */
export interface StepBudget {
  readonly leaseSeconds: number;
  readonly maxAttempts: number;
}

/**
 * A versioned typed workflow. Identity is the (workflowId, version) pair; a
 * materially different workflow is a new version. Steps are ordered; each step
 * commits exactly one checkpoint when it completes.
 */
export interface WorkflowDefinition {
  readonly workflowId: string;
  readonly version: number;
  readonly steps: ReadonlyArray<StepDefinition>;
}

export function assertWorkflowDefinition(
  definition: unknown,
): asserts definition is WorkflowDefinition {
  if (!isRecord(definition))
    throw new WorkflowDefinitionError("workflow definition must be an object");
  if (
    typeof definition.workflowId !== "string" ||
    definition.workflowId.length === 0 ||
    definition.workflowId.length > 80
  ) {
    throw new WorkflowDefinitionError("workflowId must be a non-empty string");
  }
  if (!Number.isInteger(definition.version) || (definition.version as number) < 1) {
    throw new WorkflowDefinitionError("version must be a positive integer");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new WorkflowDefinitionError("a workflow must declare at least one step");
  }
  const stepIds = new Set<string>();
  for (const [index, step] of definition.steps.entries()) {
    if (!isRecord(step)) throw new WorkflowDefinitionError(`step ${index} must be an object`);
    if (typeof step.stepId !== "string" || step.stepId.length === 0 || step.stepId.length > 80) {
      throw new WorkflowDefinitionError("each step requires a non-empty stepId");
    }
    if (stepIds.has(step.stepId))
      throw new WorkflowDefinitionError(`duplicate stepId "${step.stepId}"`);
    stepIds.add(step.stepId);
    assertBudget(step.budget, step.stepId);
    if (step.kind === "work") {
      assertArtifactShape(step.artifactShape, step.stepId, "artifactShape");
      if (!Array.isArray(step.requiredReferences)) {
        throw new WorkflowDefinitionError(`work step "${step.stepId}" requires requiredReferences`);
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
      if (step.routing !== undefined && !isRoutingRequirements(step.routing)) {
        throw new WorkflowDefinitionError(
          `work step "${step.stepId}" has invalid routing requirements`,
        );
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

function assertBudget(candidate: unknown, stepId: string): void {
  if (!isRecord(candidate)) throw new WorkflowDefinitionError(`step "${stepId}" requires a budget`);
  if (!isPositiveInteger(candidate.leaseSeconds)) {
    throw new WorkflowDefinitionError(`step "${stepId}" requires a positive integer leaseSeconds`);
  }
  if (!isPositiveInteger(candidate.maxAttempts)) {
    throw new WorkflowDefinitionError(`step "${stepId}" requires a positive integer maxAttempts`);
  }
}

function assertArtifactShape(candidate: unknown, stepId: string, field: string): void {
  if (!isRecord(candidate) || (candidate.type !== "object" && candidate.type !== "string")) {
    throw new WorkflowDefinitionError(
      `step "${stepId}" ${field} must declare type "object" or "string"`,
    );
  }
  if (
    candidate.requiredKeys !== undefined &&
    (!Array.isArray(candidate.requiredKeys) ||
      candidate.requiredKeys.some((key) => typeof key !== "string" || key.length === 0))
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
    value === "source" || value === "owned-note" || value === "rendition" || value === "derivative"
  );
}

export interface ArtifactSubmission {
  readonly content: Buffer;
  readonly policy: SourceHandlingPolicy;
  readonly provenance: Provenance;
  readonly references?: ReadonlyArray<ArtifactReference>;
}

export type ShapeValidationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate one artifact's content against a declared shape. Returns the
 * parsed value on success so callers can read decision fields for gate steps.
 */
export function validateArtifactShape(
  content: Buffer,
  shape: ArtifactShape,
): ShapeValidationResult {
  const text = content.toString("utf8");
  if (shape.type === "string") {
    return { ok: true, value: text };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "artifact content is not valid JSON" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "artifact content is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  for (const key of shape.requiredKeys ?? []) {
    if (!(key in obj)) {
      return { ok: false, reason: `artifact is missing required key "${key}"` };
    }
  }
  return { ok: true, value: parsed };
}

/** The parsed outcome of a committed human-gate decision artifact. */
export interface GateDecision {
  readonly outcome: "approve" | "reject";
  readonly note: string;
}

/**
 * Parse a gate decision from a validated decision artifact. The decision
 * shape requires `outcome` and `note`; this refines them to the discriminated
 * union the run uses to advance or fail.
 */
export function parseGateDecision(value: unknown): GateDecision {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("gate decision is not an object");
  }
  const obj = value as Record<string, unknown>;
  if (obj.outcome !== "approve" && obj.outcome !== "reject") {
    throw new Error("gate decision outcome must be approve or reject");
  }
  if (typeof obj.note !== "string") {
    throw new Error("gate decision note must be a string");
  }
  return { outcome: obj.outcome, note: obj.note };
}
