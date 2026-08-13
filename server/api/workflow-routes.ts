import type { Hono } from "hono";
import type { WorkflowDefinition } from "../workflows/workflow-definition.js";
import { isWorkflowInput } from "../workflows/workflow-input.js";
import {
  ArtifactValidationError,
  WorkflowCommitError,
  WorkflowDefinitionError,
} from "../workflows/workflow-run-repository.js";
import type { ApiDependencies } from "./api-contracts.js";
import { readJson } from "./api-contracts.js";

const workflowIdPattern = /^[a-z][a-z0-9-]{0,31}$/;

export function registerWorkflowRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/workflows", async (c) => {
    const body = await readJson(c);
    const version = body.version;
    if (
      typeof body.workflowId !== "string" ||
      !workflowIdPattern.test(body.workflowId) ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      !Array.isArray(body.steps)
    )
      return c.json({ error: "Invalid workflow definition" }, 400);
    try {
      return c.json(
        await dependencies.workflows.declare(body as unknown as WorkflowDefinition),
        201,
      );
    } catch (error) {
      if (error instanceof WorkflowDefinitionError) return c.json({ error: error.message }, 422);
      throw error;
    }
  });

  app.get("/api/workflow-runs", async (c) =>
    c.json({ runningRunIds: await dependencies.workflows.listRunningRunIds() }, 200),
  );

  app.post("/api/workflow-runs", async (c) => {
    const body = await readJson(c);
    const version = body.version;
    if (
      typeof body.workflowId !== "string" ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      !isWorkflowInput(body.input)
    ) {
      return c.json({ error: "Invalid workflow run request" }, 400);
    }
    try {
      return c.json(
        await dependencies.workflows.createRun(body.workflowId, version, body.input),
        201,
      );
    } catch (error) {
      if (error instanceof WorkflowDefinitionError) return c.json({ error: error.message }, 422);
      throw error;
    }
  });

  app.get("/api/workflow-runs/:id", async (c) => {
    const run = await dependencies.workflows.view(c.req.param("id"));
    if (!run) return c.json({ error: "Run not found" }, 404);
    return c.json(run, 200);
  });

  app.post("/api/workflow-runs/:id/gates/:step/decision", async (c) => {
    const runId = c.req.param("id");
    const stepIndex = Number(c.req.param("step"));
    if (!Number.isInteger(stepIndex) || stepIndex < 0)
      return c.json({ error: "Invalid gate step index" }, 400);
    const body = await readJson(c);
    if (
      (body.outcome !== "approve" && body.outcome !== "reject") ||
      typeof body.note !== "string" ||
      body.note.length === 0 ||
      body.note.length > 500
    ) {
      return c.json({ error: "Invalid gate decision" }, 400);
    }
    const run = await dependencies.workflows.view(runId);
    if (!run) return c.json({ error: "Run not found" }, 404);
    if (run.status !== "running") return c.json({ error: "Run is not running" }, 409);
    if (run.currentStep !== stepIndex)
      return c.json({ error: "Gate is not the current step" }, 409);
    const step = run.steps[stepIndex];
    if (!step || step.kind !== "human-gate")
      return c.json({ error: "Step is not a human gate" }, 409);
    const lease = await dependencies.workflows.claimNextStep(runId);
    if (!lease) return c.json({ error: "Gate is not leaseable" }, 409);
    try {
      await dependencies.workflows.commitCheckpoint(runId, lease, {
        content: Buffer.from(JSON.stringify({ outcome: body.outcome, note: body.note }), "utf8"),
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: { origin: "personal-testimony", detail: "human gate decision" },
      });
    } catch (error) {
      if (error instanceof ArtifactValidationError) return c.json({ error: error.message }, 422);
      if (error instanceof WorkflowCommitError) return c.json({ error: error.message }, 409);
      throw error;
    }
    const updated = await dependencies.workflows.view(runId);
    if (!updated) return c.json({ error: "Run not found after decision" }, 404);
    return c.json(updated, 200);
  });
}
