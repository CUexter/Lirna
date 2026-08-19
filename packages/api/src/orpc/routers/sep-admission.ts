import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { SepAdmissionError } from "../../sep-admission/sep-capture";
import { publicProcedure } from "../init";

const previewIdInput = z.object({ previewId: z.string().uuid() });
const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
const observationKey = z.enum(["submitted", "recommended-archive"]);

export const sepAdmissionsRouter = {
  submit: publicProcedure
    .input(z.object({ url: z.string().trim().min(1) }))
    .handler(async ({ context, input }) => {
      try {
        return await context.sepAdmissions.submit(input.url);
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

  get: publicProcedure
    .input(previewIdInput)
    .handler(async ({ context, input }) => {
      const preview = await context.sepAdmissions.get(input.previewId);
      if (!preview) throw notFound("Admission preview is unavailable");
      return preview;
    }),

  extend: publicProcedure
    .input(previewIdInput)
    .handler(async ({ context, input }) => {
      const preview = await context.sepAdmissions.extend(input.previewId);
      if (!preview) throw notFound("Admission preview is unavailable");
      return preview;
    }),

  retry: publicProcedure
    .input(previewIdInput)
    .handler(async ({ context, input }) => {
      try {
        const preview = await context.sepAdmissions.retry(input.previewId);
        if (!preview) throw notFound("Admission preview is unavailable");
        return preview;
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

  admit: publicProcedure
    .input(
      previewIdInput.extend({
        observationKeys: z.array(observationKey).min(1).max(2),
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        const result = await context.sepAdmissions.admit(
          input.previewId,
          input.observationKeys,
        );
        if (!result) throw notFound("Admission preview is unavailable");
        return result;
      } catch (error) {
        if (error instanceof SepAdmissionError) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

  state: publicProcedure
    .input(sourceStateInput)
    .handler(async ({ context, input }) => {
      const state = await context.sepAdmissions.getState(
        input.sourceId,
        input.stateId,
      );
      if (!state) throw notFound("SEP Source state is unavailable");
      return state;
    }),

  reading: publicProcedure
    .input(sourceStateInput)
    .handler(async ({ context, input }) => {
      const reading = await context.sepAdmissions.getReading(
        input.sourceId,
        input.stateId,
      );
      if (!reading) throw notFound("SEP Reading derivative is unavailable");
      return reading;
    }),

  delete: publicProcedure
    .input(previewIdInput)
    .handler(async ({ context, input }) => {
      const deleted = await context.sepAdmissions.delete(input.previewId);
      if (!deleted) throw notFound("Admission preview is unavailable");
      return { deleted: true };
    }),
};

function notFound(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}
