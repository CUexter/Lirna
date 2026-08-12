import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { Hono, type Context } from "hono";
import type { ArtifactStore } from "../artifacts/file-artifact-store.js";
import {
  syntheticOperationKind,
  type ApplicationOperation,
  type OperationRepository,
} from "../operations/operation-repository.js";
import {
  ModuleWriteOwnershipError,
  RevisionInvariantError,
  type ReviseCommand,
  type SyntheticRecordView,
} from "../domain/synthetic-domain.js";
import {
  ArtifactValidationError,
  WorkflowCommitError,
  WorkflowDefinitionError,
  type WorkflowRunRepository,
} from "../workflows/workflow-run-repository.js";
import type { WorkflowDefinition } from "../workflows/workflow-definition.js";

/**
 * The subset of the domain the control plane depends on: module write
 * contracts and module-neutral reads. Modules own their own writes.
 */
export interface DomainContract {
  module(name: string): {
    revise(command: ReviseCommand): Promise<SyntheticRecordView>;
  };
  view(recordId: string): Promise<SyntheticRecordView | undefined>;
}

interface ApiDependencies {
  operations: OperationRepository;
  artifacts: ArtifactStore;
  domain: DomainContract;
  workflows: WorkflowRunRepository;
  /** Root of the built Vite client. Defaults to `dist/client`. */
  clientRoot?: string;
}

const moduleNamePattern = /^[a-z][a-z0-9-]{0,31}$/;
const recordIdPattern = /^[0-9a-f-]{1,64}$/;

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export interface ApiServer {
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

export function createApi(dependencies: ApiDependencies): ApiServer {
  const app = new Hono();

  app.post("/api/operations", async (c) => {
    const body = await readJson(c);
    if (
      body.kind !== syntheticOperationKind ||
      typeof body.input !== "string" ||
      body.input.length === 0 ||
      body.input.length > 1_000
    ) {
      return c.json({ error: "Invalid synthetic operation" }, 400);
    }

    const operation = await dependencies.operations.submit(
      syntheticOperationKind,
      body.input,
    );
    return c.json(publicOperation(operation), 202);
  });

  app.get("/api/operations/:id/artifact", async (c) => {
    const operation = await dependencies.operations.get(c.req.param("id"));
    if (!operation?.artifactHash) {
      return c.json({ error: "Artifact not found" }, 404);
    }
    const content = await dependencies.artifacts.get(operation.artifactHash);
    if (!content) {
      return c.json({ error: "Artifact not found" }, 404);
    }
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  });

  app.get("/api/operations/:id", async (c) => {
    const operation = await dependencies.operations.get(c.req.param("id"));
    if (!operation) {
      return c.json({ error: "Operation not found" }, 404);
    }
    return c.json(publicOperation(operation), 200);
  });

  app.post("/api/workflows", async (c) => {
    const body = await readJson(c);
    const version = body.version;
    if (
      typeof body.workflowId !== "string" ||
      !moduleNamePattern.test(body.workflowId) ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      !Array.isArray(body.steps)
    ) {
      return c.json({ error: "Invalid workflow definition" }, 400);
    }
    try {
      const definition = body as unknown as WorkflowDefinition;
      const recorded = await dependencies.workflows.declare(definition);
      return c.json(recorded, 201);
    } catch (error) {
      if (error instanceof WorkflowDefinitionError) {
        return c.json({ error: error.message }, 422);
      }
      throw error;
    }
  });

  app.get("/api/workflow-runs", async (c) => {
    const ids = await dependencies.workflows.listRunningRunIds();
    return c.json({ runningRunIds: ids }, 200);
  });

  app.post("/api/workflow-runs", async (c) => {
    const body = await readJson(c);
    const version = body.version;
    if (
      typeof body.workflowId !== "string" ||
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 1 ||
      typeof body.input !== "object" ||
      body.input === null ||
      Array.isArray(body.input)
    ) {
      return c.json({ error: "Invalid workflow run request" }, 400);
    }
    try {
      const run = await dependencies.workflows.createRun(
        body.workflowId,
        version,
        body.input as Record<string, unknown>,
      );
      return c.json(run, 201);
    } catch (error) {
      if (error instanceof WorkflowDefinitionError) {
        return c.json({ error: error.message }, 422);
      }
      throw error;
    }
  });

  app.get("/api/workflow-runs/:id", async (c) => {
    const run = await dependencies.workflows.view(c.req.param("id"));
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    return c.json(run, 200);
  });

  app.post("/api/workflow-runs/:id/gates/:step/decision", async (c) => {
    const runId = c.req.param("id");
    const stepIndex = Number(c.req.param("step"));
    if (!Number.isInteger(stepIndex) || stepIndex < 0) {
      return c.json({ error: "Invalid gate step index" }, 400);
    }
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
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    if (run.status !== "running") {
      return c.json({ error: "Run is not running" }, 409);
    }
    if (run.currentStep !== stepIndex) {
      return c.json({ error: "Gate is not the current step" }, 409);
    }
    const step = run.steps[stepIndex];
    if (!step || step.kind !== "human-gate") {
      return c.json({ error: "Step is not a human gate" }, 409);
    }

    const lease = await dependencies.workflows.claimNextStep(runId);
    if (!lease) {
      return c.json({ error: "Gate is not leaseable" }, 409);
    }

    const content = Buffer.from(
      JSON.stringify({ outcome: body.outcome, note: body.note }),
      "utf8",
    );
    try {
      await dependencies.workflows.commitCheckpoint(runId, lease, {
        content,
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: {
          origin: "personal-testimony",
          detail: "human gate decision",
        },
      });
    } catch (error) {
      if (error instanceof ArtifactValidationError) {
        return c.json({ error: error.message }, 422);
      }
      if (error instanceof WorkflowCommitError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }

    const updated = await dependencies.workflows.view(runId);
    if (!updated) {
      return c.json({ error: "Run not found after decision" }, 404);
    }
    return c.json(updated, 200);
  });

  app.post("/api/synthetic-records/:id/revisions", (c) =>
    reviseRecord(c, dependencies, c.req.param("id")),
  );

  app.get("/api/synthetic-records/:id", async (c) => {
    const view = await dependencies.domain.view(c.req.param("id"));
    if (!view) {
      return c.json({ error: "Record not found" }, 404);
    }
    return c.json(view, 200);
  });

  // Any other GET is a client concern: serve the built assets, falling back to
  // the SPA shell. Unknown /api paths are genuine 404s, never the shell.
  app.get("*", (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    return serveClient(pathname, dependencies.clientRoot);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    return c.json({ error: message }, 500);
  });

  let server: ServerType | undefined;
  return {
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolveListen, reject) => {
        try {
          server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
            resolveListen(`http://${info.address}:${info.port}`);
          });
          server.once("error", reject);
        } catch (error) {
          reject(error as Error);
        }
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        if (!server) {
          resolveClose();
          return;
        }
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

/**
 * Apply one module-owned revision through the supported write contract. The
 * module named in the request performs the write; the domain refuses when that
 * module does not own the record or the revision violates the invariant.
 */
async function reviseRecord(
  c: Context,
  dependencies: ApiDependencies,
  recordId: string,
): Promise<Response> {
  if (!recordIdPattern.test(recordId)) {
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
  ) {
    return c.json({ error: "Invalid revision request" }, 400);
  }

  try {
    const view = await dependencies.domain.module(moduleName).revise({
      recordId,
      label,
      note,
      payload: payload as Record<string, unknown>,
    });
    return c.json(view, 200);
  } catch (error) {
    if (error instanceof ModuleWriteOwnershipError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof RevisionInvariantError) {
      return c.json({ error: error.message }, 422);
    }
    throw error;
  }
}

/**
 * Serve the built Vite client as static assets, falling back to the SPA shell
 * so TanStack Router owns in-app navigation. The control plane never interprets
 * client routes; unknown non-API paths return the shell.
 */
async function serveClient(pathname: string, clientRoot?: string): Promise<Response> {
  const root = resolve(clientRoot ?? resolve("dist/client"));
  const requested = resolve(root, `.${pathname}`);
  const isAsset =
    pathname !== "/" &&
    (requested === root || requested.startsWith(root + sep)) &&
    Boolean(extname(requested));

  // A request that names a concrete asset resolves to that file or 404s; only
  // extensionless (route) paths fall back to the SPA shell.
  if (isAsset) {
    const asset = await readFile(requested).catch(() => undefined);
    if (!asset) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return new Response(new Uint8Array(asset), {
      status: 200,
      headers: {
        "content-type":
          contentTypes[extname(requested)] ?? "application/octet-stream",
      },
    });
  }

  const shell = await readFile(resolve(root, "index.html"));
  return new Response(new Uint8Array(shell), {
    status: 200,
    headers: { "content-type": contentTypes[".html"]! },
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

async function readJson(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > 16_384) {
    throw new Error("Request body too large");
  }

  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function jsonResponse(value: object, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
