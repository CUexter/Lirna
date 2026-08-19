import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@lirna/api/context";
import { orpcRouter } from "@lirna/api/orpc";
import { appRouter } from "@lirna/api/routers/index";
import { auth } from "@lirna/auth";
import { env } from "@lirna/env/server";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { GetMethodCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { RPC_DEFAULT_ALLOW_METHODS } from "@orpc/server/standard";
import { Hono } from "hono";
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

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
