import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  annotationColors,
  annotationKinds,
  annotationOffsetBasis,
} from "../../annotations/annotation-contract";
import { InvalidAnnotationAnchorError } from "../../annotations/annotation-store";
import { publicProcedure } from "../init";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});

const color = z.enum(annotationColors);
const kind = z.enum(annotationKinds);
const body = z.string().trim().max(20_000).optional();
const annotation = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceStateId: z.string().uuid(),
  componentIdentity: z.string(),
  kind,
  publisherAnchor: z.string().nullable(),
  offsetBasis: z.literal(annotationOffsetBasis),
  normalizedStartOffset: z.number().int().nonnegative(),
  normalizedEndOffset: z.number().int().positive(),
  exactText: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  color,
  body: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const notFoundError = { NOT_FOUND: {} };
const annotationErrors = { ...notFoundError, BAD_REQUEST: {} };

export const annotationsRouter = {
  list: publicProcedure
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

  create: publicProcedure
    .input(
      sourceStateInput
        .extend({
          componentIdentity: z.string().trim().min(1).max(2_000),
          kind,
          publisherAnchor: z.string().trim().min(1).max(2_000).optional(),
          offsetBasis: z.literal(annotationOffsetBasis),
          normalizedStartOffset: z.number().int().nonnegative(),
          normalizedEndOffset: z.number().int().positive(),
          exactText: z.string().min(1).max(20_000),
          prefix: z.string().max(32),
          suffix: z.string().max(32),
          color,
          body,
        })
        .refine(
          (input) => input.normalizedEndOffset > input.normalizedStartOffset,
          {
            message: "Annotation end offset must follow its start offset",
            path: ["normalizedEndOffset"],
          },
        )
        .refine(
          (input) =>
            input.normalizedEndOffset - input.normalizedStartOffset ===
            input.exactText.length,
          {
            message: "Annotation range must match its exact text",
            path: ["exactText"],
          },
        ),
    )
    .output(annotation)
    .errors(annotationErrors)
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
      try {
        const annotation = await context.annotations.create(input);
        if (!annotation) throw notFound();
        return annotation;
      } catch (error) {
        if (error instanceof InvalidAnnotationAnchorError) {
          throw new ORPCError("BAD_REQUEST", { message: error.message });
        }
        throw error;
      }
    }),

  update: publicProcedure
    .input(
      sourceStateInput.extend({ id: z.string().uuid(), color, kind, body }),
    )
    .output(annotation)
    .errors(annotationErrors)
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
      try {
        const annotation = await context.annotations.update(input);
        if (!annotation) throw notFound();
        return annotation;
      } catch (error) {
        if (error instanceof InvalidAnnotationAnchorError) {
          throw new ORPCError("BAD_REQUEST", { message: error.message });
        }
        throw error;
      }
    }),

  delete: publicProcedure
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
