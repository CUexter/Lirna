import type { Hono } from "hono";
import {
  type ApplicationOperation,
  syntheticOperationKind,
} from "../operations/operation-repository.js";
import type { ApiDependencies } from "./api-contracts.js";
import { readJson } from "./api-contracts.js";

export function registerOperationRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/operations", async (c) => {
    const body = await readJson(c);
    if (
      body.kind !== syntheticOperationKind ||
      typeof body.input !== "string" ||
      body.input.length === 0 ||
      body.input.length > 1_000
    )
      return c.json({ error: "Invalid synthetic operation" }, 400);
    const operation = await dependencies.operations.submit(syntheticOperationKind, body.input);
    return c.json(publicOperation(operation), 202);
  });

  app.get("/api/operations/:id/artifact", async (c) => {
    const operation = await dependencies.operations.get(c.req.param("id"));
    if (!operation?.artifactHash) return c.json({ error: "Artifact not found" }, 404);
    const content = await dependencies.artifacts.get(operation.artifactHash);
    if (!content) return c.json({ error: "Artifact not found" }, 404);
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  });

  app.get("/api/operations/:id", async (c) => {
    const operation = await dependencies.operations.get(c.req.param("id"));
    if (!operation) return c.json({ error: "Operation not found" }, 404);
    return c.json(publicOperation(operation), 200);
  });
}

function publicOperation(operation: ApplicationOperation): object {
  return {
    id: operation.id,
    status: operation.status,
    ...(operation.result ? { result: operation.result } : {}),
    ...(operation.error ? { error: operation.error } : {}),
  };
}
