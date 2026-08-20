import { openapi } from "@orpc/openapi";
import { z } from "zod";
import type { Context } from "../context";
import { publicProcedure } from "./init";
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
        spec: (operation) => ({ ...operation, security: [] }),
      }),
    )
    .output(z.literal("OK"))
    .handler(() => "OK"),
  privateData: publicProcedure
    .meta(
      openapi({
        method: "GET",
        path: "/private",
        operationId: "privateData",
        summary: "Private data (authentication required)",
        tags: ["Health"],
      }),
    )
    .output(
      z.object({
        message: z.literal("This is private"),
        user: z
          .object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            emailVerified: z.boolean(),
            image: z.string().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date(),
          })
          .nullable(),
      }),
    )
    .handler(({ context }) => ({
      message: "This is private",
      user: context.session?.user ?? null,
    })),
};

export type OrpcRouter = typeof orpcRouter;
export type LibraryRouter = Pick<OrpcRouter, "annotations" | "sepAdmission">;
export type InquiryRouter = Pick<OrpcRouter, "sepAdmission">;
export type OrpcContext = Context;
