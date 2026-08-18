import { protectedProcedure, publicProcedure, router } from "../index";
import { annotationsRouter } from "./annotations";
import { sepAdmissionRouter } from "./sep-admission";

export const appRouter = router({
  annotations: annotationsRouter,
  sepAdmission: sepAdmissionRouter,
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
});
export type AppRouter = typeof appRouter;
