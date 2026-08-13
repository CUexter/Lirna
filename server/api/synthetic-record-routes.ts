import type { Context, Hono } from "hono";
import { ModuleWriteOwnershipError, RevisionInvariantError } from "../domain/synthetic-domain.js";
import type { ApiDependencies } from "./api-contracts.js";
import { readJson } from "./api-contracts.js";

const moduleNamePattern = /^[a-z][a-z0-9-]{0,31}$/;
const recordIdPattern = /^[0-9a-f-]{1,64}$/;

export function registerSyntheticRecordRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/synthetic-records/:id/revisions", (c) => reviseRecord(c, dependencies));
  app.get("/api/synthetic-records/:id", async (c) => {
    const view = await dependencies.domain.view(c.req.param("id"));
    if (!view) return c.json({ error: "Record not found" }, 404);
    return c.json(view, 200);
  });
}

async function reviseRecord(c: Context, dependencies: ApiDependencies): Promise<Response> {
  const recordId = c.req.param("id");
  if (typeof recordId !== "string" || !recordIdPattern.test(recordId)) {
    return c.json({ error: "Invalid record id" }, 400);
  }
  const body = await readJson(c);
  const moduleName = body.module;
  const label = body.label;
  const note = body.note;
  const payload = body.payload ?? {};
  if (
    typeof moduleName !== "string" ||
    !moduleNamePattern.test(moduleName) ||
    typeof label !== "string" ||
    label.length > 200 ||
    typeof note !== "string" ||
    note.length === 0 ||
    note.length > 200 ||
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  )
    return c.json({ error: "Invalid revision request" }, 400);

  try {
    const view = await dependencies.domain.module(moduleName).revise({
      recordId,
      label,
      note,
      payload: payload as Record<string, unknown>,
    });
    return c.json(view, 200);
  } catch (error) {
    if (error instanceof ModuleWriteOwnershipError) return c.json({ error: error.message }, 409);
    if (error instanceof RevisionInvariantError) return c.json({ error: error.message }, 422);
    throw error;
  }
}
