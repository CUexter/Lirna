import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { sepObservationKeySchema } from "../../sep-admission/sep-admission-builders";
import { SepAdmissionError } from "../../sep-admission/sep-capture";
import { sepReadingContractSchema } from "../../sep-admission/sep-reading-contract";
import { protectedProcedure } from "../init";
import {
  sepAdmissionPreviewSchema,
  sepAdmissionResultSchema,
  sepAdmittedStateSchema,
} from "./sep-admission-schemas";

const sepLibrarySourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  admittedAt: z.string().datetime(),
  states: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      observationKey: sepObservationKeySchema,
      canonicalUrl: z.string(),
      admittedAt: z.string().datetime(),
    }),
  ),
});

const previewIdInput = z.object({ previewId: z.string().uuid() });
const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
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
  listSources: protectedProcedure
    .input(z.object({}))
    .output(z.array(sepLibrarySourceSchema))
    .meta(
      openapi({
        method: "GET",
        path: "/sources",
        operationId: "sources.list",
        summary: "List admitted Sources",
        tags: ["Sources"],
      }),
    )
    .handler(({ context }) => context.sepAdmissions.listSources()),

  submit: protectedProcedure
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

  get: protectedProcedure
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

  extend: protectedProcedure
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

  retry: protectedProcedure
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

  admit: protectedProcedure
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

  state: protectedProcedure
    .input(sourceStateInput)
    .output(sepAdmittedStateSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sep-admission/state",
        operationId: "sepAdmission.state",
        summary: "Get SEP source state",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      const state = await context.sepAdmissions.getState(
        input.sourceId,
        input.stateId,
      );
      if (!state) throw notFound("SEP Source state is unavailable");
      return state;
    }),

  reading: protectedProcedure
    .input(sourceStateInput)
    .output(sepReadingContractSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sep-admission/reading",
        operationId: "sepAdmission.reading",
        summary: "Get SEP reading derivative",
        tags: ["SEP Admission"],
      }),
    )
    .handler(async ({ context, input }) => {
      const reading = await context.sepAdmissions.getReading(
        input.sourceId,
        input.stateId,
      );
      if (!reading) throw notFound("SEP Reading derivative is unavailable");
      return reading;
    }),

  delete: protectedProcedure
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
