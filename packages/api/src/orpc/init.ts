import { ORPCError, os } from "@orpc/server";
import type { Context } from "../context";

const base = os.$context<Context>();

export const publicProcedure = base;

export const protectedProcedure = base
  .errors({
    UNAUTHORIZED: {
      message: "Authentication required",
    },
  })
  .use(async ({ context, next }) => {
    if (!context.session) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Authentication required",
        cause: "No session",
      });
    }
    return next({
      context: {
        ...context,
        session: context.session,
      },
    });
  });
