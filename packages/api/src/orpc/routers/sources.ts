import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { sepObservationKeySchema } from "../../sep-admission/sep-admission-builders";
import { sepReadingContractSchema } from "../../sep-admission/sep-reading-contract";
import { publicProcedure } from "../init";
import { sepAdmittedStateSchema } from "./sep-admission-schemas";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
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
const notFoundError = { NOT_FOUND: {} };

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
