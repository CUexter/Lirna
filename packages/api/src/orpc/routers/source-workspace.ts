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
      const [workspace, sources, citationResolutions] = await Promise.all([
        context.admittedSourceStates.getWorkspace(
          input.sourceId,
          input.stateId,
        ),
        context.admittedSourceStates.listSources(),
        context.citationResolutions.list(input.sourceId, input.stateId),
      ]);
      const source = sources.find(({ id }) => id === input.sourceId);
      const reading =
        workspace?.reading ??
        (source?.kind === "legacy-sep-text"
          ? await context.admittedSourceStates.getReading(
              input.sourceId,
              input.stateId,
            )
          : undefined);
      if (!source || !reading || (source.kind === "sep" && !workspace))
        throw notFound("SEP Reading Derivative is unavailable");
      return {
        reading,
        ...(workspace ? { state: workspace.state } : {}),
        source,
        citationResolutions,
      };
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
      const workspace = await context.admittedSourceStates.getWorkspace(
        input.sourceId,
        input.stateId,
      );
      if (!workspace) throw notFound("SEP Reading Derivative is unavailable");
      const [sources, citationResolutions, annotations] = await Promise.all([
        context.admittedSourceStates.listSources(),
        context.citationResolutions.list(input.sourceId, input.stateId),
        context.annotations.list(input.sourceId, input.stateId),
      ]);
      const source = sources.find(({ id }) => id === input.sourceId);
      if (!source) throw notFound("SEP Source is unavailable");
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
        workspace: {
          ...workspace,
          source,
          citationResolutions,
        },
        annotations,
        positions,
      });
    }),
};
