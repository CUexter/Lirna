import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { sepObservationKeySchema } from "../../sep-admission/sep-admission-builders";
import { SepAdmissionError } from "../../sep-admission/sep-capture";
import { publicProcedure } from "../init";
import {
  sepAdmissionPreviewSchema,
  sepAdmissionResultSchema,
} from "./sep-admission-schemas";

const previewIdInput = z.object({ previewId: z.string().uuid() });
const badRequestError = { BAD_REQUEST: {} };
const notFoundError = { NOT_FOUND: {} };
const badRequestAndNotFoundErrors = { BAD_REQUEST: {}, NOT_FOUND: {} };

function rethrowSepAdmissionError(error: unknown): never {
  if (error instanceof SepAdmissionError) {
    throw new ORPCError("BAD_REQUEST", {
      message: error.message,
      cause: error,
    });
  }
  throw error;
}

export const sepAdmissionsRouter = {
  submit: publicProcedure
    .input(z.object({ url: z.string().trim().min(1) }))
    .output(sepAdmissionPreviewSchema)
    .errors(badRequestError)
    .meta(
      openapi({
        method: "POST",
        path: "/sep-admission/submit",
        operationId: "sepAdmission.submit",
        summary: "Submit a URL for SEP admission preview",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        return await context.sepAdmissions.submit(input.url);
      } catch (error) {
        rethrowSepAdmissionError(error);
      }
    }),

  get: publicProcedure
    .input(previewIdInput)
    .output(sepAdmissionPreviewSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sep-admission/preview/{previewId}",
        operationId: "sepAdmission.get",
        summary: "Get an admission preview",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      const preview = await context.sepAdmissions.get(input.previewId);
      if (!preview) throw notFound("Admission preview is unavailable");
      return preview;
    }),

  extend: publicProcedure
    .input(previewIdInput)
    .output(sepAdmissionPreviewSchema)
    .errors(badRequestAndNotFoundErrors)
    .meta(
      openapi({
        method: "POST",
        path: "/sep-admission/preview/{previewId}/extend",
        operationId: "sepAdmission.extend",
        summary: "Extend an admission preview",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        const preview = await context.sepAdmissions.extend(input.previewId);
        if (!preview) throw notFound("Admission preview is unavailable");
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error);
      }
    }),

  retry: publicProcedure
    .input(previewIdInput)
    .output(sepAdmissionPreviewSchema)
    .errors(badRequestAndNotFoundErrors)
    .meta(
      openapi({
        method: "POST",
        path: "/sep-admission/preview/{previewId}/retry",
        operationId: "sepAdmission.retry",
        summary: "Retry an admission preview",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        const preview = await context.sepAdmissions.retry(input.previewId);
        if (!preview) throw notFound("Admission preview is unavailable");
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error);
      }
    }),

  admit: publicProcedure
    .input(
      previewIdInput.extend({
        observationKeys: z.array(sepObservationKeySchema).min(1).max(2),
      }),
    )
    .output(sepAdmissionResultSchema)
    .errors(badRequestAndNotFoundErrors)
    .meta(
      openapi({
        method: "POST",
        path: "/sep-admission/preview/{previewId}/admit",
        operationId: "sepAdmission.admit",
        summary: "Admit a preview with observations",
        tags: ["SEP Admission"],
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
        rethrowSepAdmissionError(error);
      }
    }),

  delete: publicProcedure
    .input(previewIdInput)
    .output(z.object({ deleted: z.literal(true) }))
    .errors(notFoundError)
    .meta(
      openapi({
        method: "DELETE",
        path: "/sep-admission/preview/{previewId}",
        operationId: "sepAdmission.delete",
        summary: "Delete an admission preview",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      const deleted = await context.sepAdmissions.delete(input.previewId);
      if (!deleted) throw notFound("Admission preview is unavailable");
      return { deleted: true };
    }),
};

function notFound(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}
