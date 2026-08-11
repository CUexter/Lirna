import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ArtifactStore } from "../artifacts/file-artifact-store.js";
import {
  syntheticOperationKind,
  type ApplicationOperation,
  type OperationRepository,
} from "../operations/operation-repository.js";

interface ApiDependencies {
  operations: OperationRepository;
  artifacts: ArtifactStore;
}

export interface ApiServer {
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

export function createApi(dependencies: ApiDependencies): ApiServer {
  const server = createServer(async (request, response) => {
    try {
      await route(request, response, dependencies);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      sendJson(response, 500, { error: message });
    }
  });

  return {
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          const address = server.address() as AddressInfo;
          resolve(`http://${address.address}:${address.port}`);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiDependencies,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://lirna.local");

  const staticFiles: Record<string, [string, string]> = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/icon.svg": ["icon.svg", "image/svg+xml"],
    "/manifest.webmanifest": [
      "manifest.webmanifest",
      "application/manifest+json; charset=utf-8",
    ],
    "/service-worker.js": ["service-worker.js", "text/javascript; charset=utf-8"],
  };
  const staticFile = staticFiles[url.pathname];
  if (request.method === "GET" && staticFile) {
    const content = await readFile(resolve("public", staticFile[0]));
    response.writeHead(200, { "content-type": staticFile[1] });
    response.end(content);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/operations") {
    const body = await readJson(request);
    if (
      body.kind !== syntheticOperationKind ||
      typeof body.input !== "string" ||
      body.input.length === 0 ||
      body.input.length > 1_000
    ) {
      sendJson(response, 400, { error: "Invalid synthetic operation" });
      return;
    }

    const operation = await dependencies.operations.submit(
      syntheticOperationKind,
      body.input,
    );
    sendJson(response, 202, publicOperation(operation));
    return;
  }

  const artifactMatch = url.pathname.match(
    /^\/api\/operations\/([0-9a-f-]+)\/artifact$/,
  );
  if (request.method === "GET" && artifactMatch) {
    const operation = await dependencies.operations.get(artifactMatch[1]!);
    if (!operation?.artifactHash) {
      sendJson(response, 404, { error: "Artifact not found" });
      return;
    }
    const content = await dependencies.artifacts.get(operation.artifactHash);
    if (!content) {
      sendJson(response, 404, { error: "Artifact not found" });
      return;
    }
    response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
    response.end(content);
    return;
  }

  const operationMatch = url.pathname.match(/^\/api\/operations\/([0-9a-f-]+)$/);
  if (request.method === "GET" && operationMatch) {
    const operation = await dependencies.operations.get(operationMatch[1]!);
    if (!operation) {
      sendJson(response, 404, { error: "Operation not found" });
      return;
    }
    sendJson(response, 200, publicOperation(operation));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function publicOperation(operation: ApplicationOperation): object {
  return {
    id: operation.id,
    status: operation.status,
    ...(operation.result ? { result: operation.result } : {}),
    ...(operation.error ? { error: operation.error } : {}),
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_384) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }

  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, value: object): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
