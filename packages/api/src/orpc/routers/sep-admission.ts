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
const errorReference = { data: z.object({ requestId: z.string() }) };
const badRequestError = {
  BAD_REQUEST: errorReference,
  INTERNAL_SERVER_ERROR: errorReference,
};
const notFoundError = {
  NOT_FOUND: errorReference,
  INTERNAL_SERVER_ERROR: errorReference,
};
const badRequestAndNotFoundErrors = {
  BAD_REQUEST: errorReference,
  NOT_FOUND: errorReference,
  INTERNAL_SERVER_ERROR: errorReference,
};

function rethrowSepAdmissionError(error: unknown, requestId: string): never {
  if (error instanceof ORPCError) throw error;
  if (error instanceof SepAdmissionError) {
    throw new ORPCError("BAD_REQUEST", {
      message: error.message,
      cause: error,
      data: { requestId },
    });
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Internal Server Error",
    cause: error,
    data: { requestId },
  });
}

export const sepAdmissionsRouter = {
  submit: publicProcedure
    .input(
      z.object({
        url: z.string().trim().min(1),
        replacesSourceId: z.string().uuid().optional(),
      }),
    )
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
        return await context.sepAdmissions.submit(
          input.url,
          context.observation,
          input.replacesSourceId,
        );
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
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
      try {
        const preview = await context.sepAdmissions.get(input.previewId);
        if (!preview)
          throw notFound(
            "Admission preview is unavailable",
            requestId(context),
          );
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
      }
    }),

  checkUpdate: publicProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .output(sepAdmissionPreviewSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/sep-admission/update",
        operationId: "sepAdmission.checkUpdate",
        summary: "Create a temporary Source update comparison",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        const preview = await context.sepAdmissions.checkUpdate(
          input.sourceId,
          context.observation,
        );
        if (!preview) {
          throw notFound(
            "This Source cannot be checked for SEP updates",
            requestId(context),
          );
        }
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
      }
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
        if (!preview)
          throw notFound(
            "Admission preview is unavailable",
            requestId(context),
          );
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
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
        const preview = await context.sepAdmissions.retry(
          input.previewId,
          context.observation,
        );
        if (!preview)
          throw notFound(
            "Admission preview is unavailable",
            requestId(context),
          );
        return preview;
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
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
          context.observation,
        );
        if (!result)
          throw notFound(
            "Admission preview is unavailable",
            requestId(context),
          );
        return result;
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
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
      try {
        const deleted = await context.sepAdmissions.delete(input.previewId);
        if (!deleted)
          throw notFound(
            "Admission preview is unavailable",
            requestId(context),
          );
        return { deleted: true };
      } catch (error) {
        rethrowSepAdmissionError(error, requestId(context));
      }
    }),
};

function requestId(context: { observation?: { requestId: string } }) {
  return context.observation?.requestId ?? "unknown";
}

function notFound(message: string, requestId: string) {
  return new ORPCError("NOT_FOUND", { message, data: { requestId } });
}
