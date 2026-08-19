import type { Context } from "../context";
import { protectedProcedure, publicProcedure } from "./init";

export const orpcRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session.user,
  })),
};

export type OrpcRouter = typeof orpcRouter;
export type OrpcContext = Context;
