import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { publicProcedure } from "../init";
import {
  notFoundError,
  offlineWorkingSetSchema,
  readingWorkspaceSchema,
  sourceStateInput,
} from "./source-router-contracts";
import { notFound } from "./source-router-support";

export const sourceWorkspaceProcedures = {
  readingWorkspace: publicProcedure
    .input(sourceStateInput)
    .output(readingWorkspaceSchema)
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
      const workspace = await context.readingWorkspaces.read(
        input.sourceId,
        input.stateId,
      );
      if (!workspace) throw notFound("SEP Reading Derivative is unavailable");
      return workspace;
    }),

  offlineManifest: publicProcedure
    .input(sourceStateInput)
    .output(offlineWorkingSetSchema)
    .errors({ ...notFoundError, FORBIDDEN: {} })
    .meta(
      openapi({
        method: "GET",
        path: "/sources/offline-working-set",
        operationId: "sources.offlineManifest",
        summary: "Get a bounded Offline working set snapshot",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const result = await context.offlineWorkingSets.capture(
        input.sourceId,
        input.stateId,
      );
      if (result.status === "unavailable") {
        throw notFound("SEP Reading Derivative is unavailable");
      }
      if (result.status === "policy-ineligible") {
        throw new ORPCError("FORBIDDEN", {
          message: `Source handling policy does not permit Offline working-set retention: ${result.reasons.join(", ")}`,
        });
      }
      return result.snapshot;
    }),
};
