import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  readingSemanticLocationSchema,
  semanticLocationMatchesPosition,
} from "../../reading-position/reading-position-contract";
import { sepObservationKeySchema } from "../../sep-admission/sep-admission-builders";
import { sepReadingContractSchema } from "../../sep-admission/sep-reading-contract";
import { authenticatedProcedure, publicProcedure } from "../init";
import { citationResolutionSchema } from "./citation-resolution-schema";
import { sepAdmittedStateSchema } from "./sep-admission-schemas";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
export const sepLibrarySourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  admittedAt: z.string().datetime(),
  authors: z.array(z.string()),
  publisher: z.string(),
  publicationHistory: z.array(z.string()),
  kind: z.enum(["sep", "legacy-sep-text"]),
  stableKey: z.string().optional(),
  currentStateId: z.string().uuid().optional(),
  replacement: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      currentStateId: z.string().uuid(),
    })
    .optional(),
  states: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      observationKey: sepObservationKeySchema,
      canonicalUrl: z.string(),
      title: z.string(),
      publisher: z.string(),
      admittedAt: z.string().datetime(),
    }),
  ),
});
const notFoundError = { NOT_FOUND: {} };
const readingPosition = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
  sourceTitle: z.string(),
  componentIdentity: z.string(),
  componentLabel: z.string(),
  scrollTop: z.number().int().nonnegative(),
  semanticLocation: readingSemanticLocationSchema.optional(),
  savedAt: z.string().datetime(),
});

export const sourcesRouter = {
  list: publicProcedure
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
    .handler(({ context }) => context.admittedSourceStates.listSources()),

  delete: publicProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .output(z.boolean())
    .errors(notFoundError)
    .meta(
      openapi({
        method: "DELETE",
        path: "/sources",
        operationId: "sources.delete",
        summary: "Delete an admitted Source",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const deleted = await context.admittedSourceStates.deleteSource(
        input.sourceId,
      );
      if (!deleted) throw notFound("SEP Source is unavailable");
      return deleted;
    }),

  state: publicProcedure
    .input(sourceStateInput)
    .output(sepAdmittedStateSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sources/state",
        operationId: "sources.state",
        summary: "Get SEP Source state",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const state = await context.admittedSourceStates.getState(
        input.sourceId,
        input.stateId,
      );
      if (!state) throw notFound("SEP Source state is unavailable");
      return state;
    }),

  reading: publicProcedure
    .input(sourceStateInput)
    .output(sepReadingContractSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sources/reading",
        operationId: "sources.reading",
        summary: "Get SEP reading Derivative",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const reading = await context.admittedSourceStates.getReading(
        input.sourceId,
        input.stateId,
      );
      if (!reading) throw notFound("SEP Reading Derivative is unavailable");
      return reading;
    }),

  readingWorkspace: authenticatedProcedure
    .input(sourceStateInput)
    .output(
      z.object({
        reading: sepReadingContractSchema,
        state: sepAdmittedStateSchema.optional(),
        source: sepLibrarySourceSchema,
        citationResolutions: z.array(citationResolutionSchema),
      }),
    )
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sources/reading-workspace",
        operationId: "sources.readingWorkspace",
        summary: "Get a Reading workspace projection",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const [reading, state, sources, citationResolutions] = await Promise.all([
        context.admittedSourceStates.getReading(input.sourceId, input.stateId),
        context.admittedSourceStates.getState(input.sourceId, input.stateId),
        context.admittedSourceStates.listSources(),
        context.citationResolutions.list(input.sourceId, input.stateId),
      ]);
      const source = sources.find(({ id }) => id === input.sourceId);
      if (!reading || !source || (source.kind === "sep" && !state)) {
        throw notFound("SEP Reading Derivative is unavailable");
      }
      return {
        reading,
        ...(state ? { state } : {}),
        source,
        citationResolutions,
      };
    }),

  resume: {
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
      .output(readingPosition.nullable())
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
      .output(readingPosition)
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
  },
  assistant: {
    ask: publicProcedure
      .input(
        sourceStateInput.extend({
          componentIdentity: z.string().trim().min(1).max(2_000),
          question: z.string().trim().min(1).max(4_000),
        }),
      )
      .output(z.object({ answer: z.string().min(1) }))
      .errors(notFoundError)
      .meta(
        openapi({
          method: "POST",
          path: "/sources/assistant",
          operationId: "sources.assistant.ask",
          summary: "Ask a question about an admitted Source state",
          tags: ["Sources"],
        }),
      )
      .handler(async ({ context, input }) => {
        const reading = await context.admittedSourceStates.getReading(
          input.sourceId,
          input.stateId,
        );
        if (!reading) throw notFound("SEP Reading Derivative is unavailable");
        const component = reading.components.find(
          ({ identity }) => identity === input.componentIdentity,
        );
        if (!component) throw notFound("SEP Reading component is unavailable");
        if (!context.researchAssistant) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Research assistant is not configured",
          });
        }
        return context.researchAssistant.answer({
          question: input.question,
          sourceTitle: reading.source.title,
          componentLabel: component.label,
          sourceText: component.plainText,
        });
      }),
  },
};

function notFound(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}
