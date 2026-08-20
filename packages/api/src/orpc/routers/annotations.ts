import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { annotationColors } from "../../annotations/annotation-contract";
import { protectedProcedure } from "../init";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});

const color = z.enum(annotationColors);
const body = z.string().trim().max(20_000).optional();
const annotation = z.object({
  id: z.string().uuid(),
  sourceStateId: z.string().uuid(),
  componentIdentity: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  exactText: z.string(),
  color,
  body: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const notFoundError = { NOT_FOUND: {} };

export const annotationsRouter = {
  list: protectedProcedure
    .input(sourceStateInput)
    .output(z.array(annotation))
    .meta(
      openapi({
        method: "GET",
        path: "/annotations",
        operationId: "annotations.list",
        summary: "List annotations for a source state",
        tags: ["Annotations"],
      }),
    )
    .handler(({ context, input }) =>
      context.annotations.list(input.sourceId, input.stateId),
    ),

  create: protectedProcedure
    .input(
      sourceStateInput
        .extend({
          componentIdentity: z.string().trim().min(1).max(2_000),
          startOffset: z.number().int().nonnegative(),
          endOffset: z.number().int().positive(),
          exactText: z.string().min(1).max(20_000),
          color,
          body,
        })
        .refine((input) => input.endOffset > input.startOffset, {
          message: "Annotation end offset must follow its start offset",
          path: ["endOffset"],
        })
        .refine(
          (input) =>
            input.endOffset - input.startOffset === input.exactText.length,
          {
            message: "Annotation range must match its exact text",
            path: ["exactText"],
          },
        ),
    )
    .output(annotation)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/annotations",
        operationId: "annotations.create",
        summary: "Create an annotation",
        tags: ["Annotations"],
      }),
    )
    .handler(async ({ context, input }) => {
      const annotation = await context.annotations.create(input);
      if (!annotation) throw notFound();
      return annotation;
    }),

  update: protectedProcedure
    .input(sourceStateInput.extend({ id: z.string().uuid(), color, body }))
    .output(annotation)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "PATCH",
        path: "/annotations/{id}",
        operationId: "annotations.update",
        summary: "Update an annotation",
        tags: ["Annotations"],
      }),
    )
    .handler(async ({ context, input }) => {
      const annotation = await context.annotations.update(input);
      if (!annotation) throw notFound();
      return annotation;
    }),

  delete: protectedProcedure
    .input(sourceStateInput.extend({ id: z.string().uuid() }))
    .output(z.object({ deleted: z.literal(true) }))
    .errors(notFoundError)
    .meta(
      openapi({
        method: "DELETE",
        path: "/annotations/{id}",
        operationId: "annotations.delete",
        summary: "Delete an annotation",
        tags: ["Annotations"],
      }),
    )
    .handler(async ({ context, input }) => {
      const deleted = await context.annotations.delete(
        input.sourceId,
        input.stateId,
        input.id,
      );
      if (!deleted) throw notFound();
      return { deleted: true };
    }),
};

function notFound() {
  return new ORPCError("NOT_FOUND", {
    message: "Annotation or Source state is unavailable",
  });
}
