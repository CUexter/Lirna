import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { ApiDependencies, DomainContract } from "./api-contracts.js";
import { registerOperationRoutes } from "./operation-routes.js";
import { registerSourceRoutes } from "./source-routes.js";
import { serveClient } from "./static-client.js";
import { registerSyntheticRecordRoutes } from "./synthetic-record-routes.js";
import { registerWorkflowRoutes } from "./workflow-routes.js";

export type { ApiDependencies, DomainContract } from "./api-contracts.js";

export interface ApiServer {
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

export function createApi(dependencies: ApiDependencies): ApiServer {
  const app = new Hono();
  registerOperationRoutes(app, dependencies);
  registerSourceRoutes(app, dependencies);
  registerWorkflowRoutes(app, dependencies);
  registerSyntheticRecordRoutes(app, dependencies);
  app.get("*", (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname.startsWith("/api/")) return c.json({ error: "Not found" }, 404);
    return serveClient(pathname, dependencies.clientRoot);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((error, c) =>
    c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500));

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
        if (!server) return resolveClose();
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}
