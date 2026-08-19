import { openapi } from "@orpc/openapi";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure } from "./init";
import { annotationsRouter } from "./routers/annotations";
import { sepAdmissionsRouter } from "./routers/sep-admission";

export const orpcRouter = {
  annotations: annotationsRouter,
  sepAdmission: sepAdmissionsRouter,
  healthCheck: publicProcedure
    .meta(
      openapi({
        method: "GET",
        path: "/health",
        operationId: "healthCheck",
        summary: "Service health check",
        tags: ["Health"],
      }),
    )
    .handler(() => "OK"),
  privateData: protectedProcedure
    .meta(
      openapi({
        method: "GET",
        path: "/private",
        operationId: "privateData",
        summary: "Private data (authentication required)",
        tags: ["Health"],
      }),
    )
    .handler(({ context }) => ({
      message: "This is private",
      user: context.session.user,
    })),
};

export type OrpcRouter = typeof orpcRouter;
export type OrpcContext = Context;
