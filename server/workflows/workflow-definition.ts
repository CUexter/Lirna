import type {
  ArtifactReference,
  Provenance,
  SourceHandlingPolicy,
} from "../artifacts/artifact-registry.js";
import type { RoutingRequirements } from "./executor-router.js";

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
