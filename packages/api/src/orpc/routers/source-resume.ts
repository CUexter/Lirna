import { openapi } from "@orpc/openapi";
import { z } from "zod";
import {
  readingSemanticLocationSchema,
  semanticLocationMatchesPosition,
} from "../../reading-position/reading-position-contract";
import { publicProcedure } from "../init";
import {
  notFoundError,
  readingPositionSchema,
  sourceStateInput,
} from "./source-router-contracts";
import { notFound } from "./source-router-support";

export const sourceResumeRouter = {
  get: publicProcedure
    .input(
      z
        .object({
          sourceId: z.string().uuid().optional(),
          stateId: z.string().uuid().optional(),
          componentIdentity: z.string().trim().min(1).max(2_000).optional(),
        })
        .refine(
          ({ sourceId, stateId, componentIdentity }) =>
            [sourceId, stateId, componentIdentity].filter(Boolean).length ===
              0 || Boolean(sourceId && stateId && componentIdentity),
          "Resume scope requires sourceId, stateId, and componentIdentity",
        ),
    )
    .output(readingPositionSchema.nullable())
    .meta(
      openapi({
        method: "GET",
        path: "/sources/resume",
        operationId: "sources.resume.get",
        summary: "Get the latest reading position",
        tags: ["Sources"],
      }),
    )
    .handler(
      async ({ context, input }) =>
        (await context.readingPositions.get(
          input.sourceId && input.stateId && input.componentIdentity
            ? {
                sourceId: input.sourceId,
                stateId: input.stateId,
                componentIdentity: input.componentIdentity,
              }
            : undefined,
        )) ?? null,
    ),
  save: publicProcedure
    .input(
      sourceStateInput
        .extend({
          componentIdentity: z.string().trim().min(1).max(2_000),
          componentLabel: z.string().trim().min(1).max(2_000),
          scrollTop: z.number().int().nonnegative(),
          semanticLocation: readingSemanticLocationSchema.optional(),
        })
        .superRefine((input, context) => {
          const semantic = input.semanticLocation;
          if (!semantic) return;
          if (!semanticLocationMatchesPosition(semantic, input)) {
            context.addIssue({
              code: "custom",
              message:
                "Semantic and pixel positions must describe the same scene",
            });
          }
        }),
    )
    .output(readingPositionSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "PUT",
        path: "/sources/resume",
        operationId: "sources.resume.save",
        summary: "Save the latest reading position",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const position = await context.readingPositions.save(input);
      if (!position) throw notFound("SEP Source state is unavailable");
      return position;
    }),
};
