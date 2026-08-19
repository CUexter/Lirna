import { createContext } from "@lirna/api/context";
import { generateOpenApiDocument } from "@lirna/api/openapi";
import { orpcRouter } from "@lirna/api/orpc";
import { auth } from "@lirna/auth";
import { env } from "@lirna/env/server";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { GetMethodCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { RPC_DEFAULT_ALLOW_METHODS } from "@orpc/server/standard";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const orpcHandler = new RPCHandler(orpcRouter, {
  allowMethods: ["GET", ...RPC_DEFAULT_ALLOW_METHODS],
  plugins: [new GetMethodCsrfProtectionHandlerPlugin()],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/orpc/*", async (c, next) => {
  const context = createContext({ context: c });
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/orpc",
    context: await context,
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

const openApiSpec = generateOpenApiDocument();

const requireSession: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json(
      { code: "UNAUTHORIZED", message: "Authentication required" },
      401,
    );
  }
  await next();
};

app.get("/openapi.json", requireSession, async (c) => {
  return c.json(await openApiSpec);
});

app.get(
  "/docs",
  requireSession,
  Scalar({ spec: { url: "/openapi.json" }, title: "Lirna API" }),
);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
