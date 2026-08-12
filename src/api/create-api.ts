import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { ArtifactStore } from "../artifacts/file-artifact-store.js";
import {
  syntheticOperationKind,
  type ApplicationOperation,
  type OperationRepository,
} from "../operations/operation-repository.js";

interface ApiDependencies {
  operations: OperationRepository;
  artifacts: ArtifactStore;
  /** Root of the built Vite client. Defaults to `dist/client`. */
  clientRoot?: string;
}

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

  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    await serveClient(url.pathname, response, dependencies.clientRoot);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

/**
 * Serve the built Vite client as static assets, falling back to the SPA shell
 * so TanStack Router owns in-app navigation. The control plane never interprets
 * client routes; unknown non-API paths return the shell.
 */
async function serveClient(
  pathname: string,
  response: ServerResponse,
  clientRoot = resolve("dist/client"),
): Promise<void> {
  const root = resolve(clientRoot);
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
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(requested)] ?? "application/octet-stream",
    });
    response.end(asset);
    return;
  }

  const shell = await readFile(resolve(root, "index.html"));
  response.writeHead(200, { "content-type": contentTypes[".html"]! });
  response.end(shell);
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
