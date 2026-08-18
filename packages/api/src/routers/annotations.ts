import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { annotationColors } from "../annotations/annotation-contract";
import { publicProcedure, router } from "../index";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
const color = z.enum(annotationColors);
const body = z.string().trim().max(20_000).optional();

export const annotationsRouter = router({
  list: publicProcedure
    .input(sourceStateInput)
    .query(({ ctx, input }) =>
      ctx.annotations.list(input.sourceId, input.stateId),
    ),
  create: publicProcedure
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
    .mutation(async ({ ctx, input }) => {
      const annotation = await ctx.annotations.create(input);
      if (!annotation) throw notFound();
      return annotation;
    }),
  update: publicProcedure
    .input(
      sourceStateInput.extend({
        id: z.string().uuid(),
        color,
        body,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const annotation = await ctx.annotations.update(input);
      if (!annotation) throw notFound();
      return annotation;
    }),
  delete: publicProcedure
    .input(sourceStateInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.annotations.delete(
        input.sourceId,
        input.stateId,
        input.id,
      );
      if (!deleted) throw notFound();
      return { deleted: true };
    }),
});

function notFound() {
  return new TRPCError({
    code: "NOT_FOUND",
    message: "Annotation or Source state is unavailable",
  });
}
