import { openapi } from "@orpc/openapi";
import { createOfflineWorkingSetSnapshot } from "../../offline-working-set/offline-working-set";
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
    .errors(notFoundError)
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
      const workspace = await context.readingWorkspaces.read(
        input.sourceId,
        input.stateId,
      );
      if (!workspace) throw notFound("SEP Reading Derivative is unavailable");
      const annotations = await context.annotations.list(
        input.sourceId,
        input.stateId,
      );
      const positions = (
        await Promise.all(
          workspace.reading.components.map((component) =>
            context.readingPositions.get({
              sourceId: input.sourceId,
              stateId: input.stateId,
              componentIdentity: component.identity,
            }),
          ),
        )
      ).filter((position) => position !== undefined);
      return createOfflineWorkingSetSnapshot({
        workspace,
        annotations,
        positions,
      });
    }),
};
