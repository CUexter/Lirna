import { openapi } from "@orpc/openapi";
import { z } from "zod";
import { sepReadingContractSchema } from "../../sep-admission/reading/contract";
import { publicProcedure } from "../init";
import { sepAdmittedStateSchema } from "./sep-admission-schemas";
import { sourceAssistantRouter } from "./source-assistant";
import { sourceDerivativesRouter } from "./source-derivatives";
import { sourceResumeRouter } from "./source-resume";
import {
  notFoundError,
  sepLibrarySourceSchema,
  sourceStateInput,
} from "./source-router-contracts";
import { notFound, requireReading } from "./source-router-support";
import { sourceWorkspaceProcedures } from "./source-workspace";

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
    .handler(({ context, input }) => requireReading(context, input)),

  ...sourceWorkspaceProcedures,
  derivatives: sourceDerivativesRouter,
  resume: sourceResumeRouter,
  assistant: sourceAssistantRouter,
};
