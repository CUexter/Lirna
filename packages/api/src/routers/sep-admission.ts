import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { SepAdmissionError } from "../sep-admission/sep-capture";

const previewIdInput = z.object({ previewId: z.string().uuid() });
const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
const observationKey = z.enum(["submitted", "recommended-archive"]);

export const sepAdmissionRouter = router({
  submit: protectedProcedure
    .input(z.object({ url: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.sepAdmissions.submit(input.url);
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),
  get: protectedProcedure
    .input(previewIdInput)
    .query(async ({ ctx, input }) => {
      const preview = await ctx.sepAdmissions.get(input.previewId);
      if (!preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Admission preview is unavailable",
        });
      }
      return preview;
    }),
  extend: protectedProcedure
    .input(previewIdInput)
    .mutation(async ({ ctx, input }) => {
      const preview = await ctx.sepAdmissions.extend(input.previewId);
      if (!preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Admission preview is unavailable",
        });
      }
      return preview;
    }),
  retry: protectedProcedure
    .input(previewIdInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const preview = await ctx.sepAdmissions.retry(input.previewId);
        if (!preview) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Admission preview is unavailable",
          });
        }
        return preview;
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),
  admit: protectedProcedure
    .input(
      previewIdInput.extend({
        observationKeys: z.array(observationKey).min(1).max(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ctx.sepAdmissions.admit(
          input.previewId,
          input.observationKeys,
        );
        if (!result) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Admission preview is unavailable",
          });
        }
        return result;
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),
  state: protectedProcedure
    .input(sourceStateInput)
    .query(async ({ ctx, input }) => {
      const state = await ctx.sepAdmissions.getState(
        input.sourceId,
        input.stateId,
      );
      if (!state) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "SEP Source state is unavailable",
        });
      }
      return state;
    }),
  reading: protectedProcedure
    .input(sourceStateInput)
    .query(async ({ ctx, input }) => {
      const reading = await ctx.sepAdmissions.getReading(
        input.sourceId,
        input.stateId,
      );
      if (!reading) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "SEP Reading derivative is unavailable",
        });
      }
      return reading;
    }),
  delete: protectedProcedure
    .input(previewIdInput)
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.sepAdmissions.delete(input.previewId);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Admission preview is unavailable",
        });
      }
      return { deleted: true };
    }),
});
