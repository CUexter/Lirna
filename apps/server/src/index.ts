import { createContext } from "@lirna/api/context";
import type { RequestObservation } from "@lirna/api/observation";
import { generateOpenApiDocument } from "@lirna/api/openapi";
import { orpcRouter } from "@lirna/api/orpc";
import { auth } from "@lirna/auth";
import { env } from "@lirna/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { GetMethodCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { RPC_DEFAULT_ALLOW_METHODS } from "@orpc/server/standard";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import pino, { type Logger } from "pino";

type AppVariables = {
  requestObservation: RequestObservation;
};

function writeLog(
  logger: Logger,
  level: "info" | "warn" | "error",
  record: Record<string, unknown>,
) {
  try {
    logger[level](record);
  } catch {
    // Diagnostics must not alter request handling.
  }
}

export function createApp(
  options: { logger?: Logger; createRequestId?: () => string } = {},
) {
  const rootLogger = options.logger ?? pino({ level: env.LOG_LEVEL });
  const createRequestId =
    options.createRequestId ?? (() => crypto.randomUUID().slice(0, 12));
  const app = new Hono<{ Variables: AppVariables }>();

  app.onError((_error, c) =>
    c.json(
      { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error" },
      500,
    ),
  );

  app.use("/*", async (c, next) => {
    const requestId = createRequestId();
    const requestLogger = rootLogger.child({ requestId });
    const startedAt = performance.now();
    let thrown = false;
    c.header("X-Request-ID", requestId);
    c.set("requestObservation", {
      requestId,
      emit(level, record) {
        writeLog(requestLogger, level, record);
      },
    });
    try {
      await next();
    } catch (error) {
      thrown = true;
      throw error;
    } finally {
      const status = thrown ? 500 : c.res.status;
      const level = status >= 500 ? "error" : "info";
      writeLog(requestLogger, level, {
        event: "request.completed",
        method: c.req.method,
        route: new URL(c.req.url).pathname,
        status,
        durationMilliseconds: Math.max(
          0,
          Math.round(performance.now() - startedAt),
        ),
        outcome: status >= 400 ? "failure" : "success",
      });
    }
  });
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["X-Request-ID"],
      credentials: true,
    }),
  );

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const orpcHandler = new RPCHandler(orpcRouter, {
    allowMethods: ["GET", ...RPC_DEFAULT_ALLOW_METHODS],
    plugins: [new GetMethodCsrfProtectionHandlerPlugin()],
  });

  const openApiHandler = new OpenAPIHandler(orpcRouter);

  app.use("/orpc/*", async (c, next) => {
    const context = createContext({
      context: c,
      observation: c.get("requestObservation"),
    });
    const { matched, response } = await orpcHandler.handle(c.req.raw, {
      prefix: "/orpc",
      context: await context,
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });

  app.use("/*", async (c, next) => {
    const { matched, response } = await openApiHandler.handle(c.req.raw, {
      context: await createContext({
        context: c,
        observation: c.get("requestObservation"),
      }),
    });
    if (matched) return c.newResponse(response.body, response);
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

  app.get("/openapi.json", requireSession, async (c) =>
    c.json(await openApiSpec),
  );

  app.get(
    "/docs",
    requireSession,
    Scalar({ spec: { url: "/openapi.json" }, title: "Lirna API" }),
  );

  app.get("/", (c) => c.text("OK"));
  return app;
}

export const app = createApp();

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
  });
}

export default app;
