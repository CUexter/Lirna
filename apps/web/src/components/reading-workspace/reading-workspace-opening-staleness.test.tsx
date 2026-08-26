import { expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";

import { historySemanticLocation } from "./reading-history-position";
import { sourceId, stateId } from "./reading-test-fixtures";
import {
  openingReads,
  queryWrapper,
  retainedPosition,
  retainedRecord,
  type Target,
  testQueryClient,
  useReadingWorkspaceOpening,
  type Workspace,
} from "./reading-workspace-opening-test-support";
import { readingWorkspaceFixture } from "./source-information-test-fixture";

test("ignores retained completion for an obsolete Source state", async () => {
  const online = Promise.withResolvers<Workspace>();
  const obsoleteRetained = Promise.withResolvers<unknown>();
  const currentSourceId = "source-current";
  const currentStateId = "state-current";
  const currentWorkspace = readingWorkspaceFixture();
  currentWorkspace.reading.source.title = "Current workspace";
  openingReads.online = () => online.promise;
  openingReads.retained = ({ sourceId: requestedSourceId }) =>
    requestedSourceId === sourceId
      ? obsoleteRetained.promise
      : Promise.resolve(
          retainedRecord({
            annotations: [{ id: "current-annotation" }],
            hash: "current-replica",
            workspace: currentWorkspace,
          }),
        );
  const client = testQueryClient();
  const { result, rerender } = renderHook(
    (target: Target) => useReadingWorkspaceOpening(target),
    {
      initialProps: { sourceId, stateId },
      wrapper: queryWrapper(client),
    },
  );

  rerender({ sourceId: currentSourceId, stateId: currentStateId });
  await waitFor(() =>
    expect(result.current).toMatchObject({
      status: "ready",
      origin: "retained",
      workspace: currentWorkspace,
    }),
  );
  await act(async () =>
    obsoleteRetained.resolve(
      retainedRecord({
        annotations: [{ id: "obsolete-annotation" }],
        hash: "obsolete-replica",
      }),
    ),
  );

  expect(result.current).toMatchObject({
    status: "ready",
    origin: "retained",
    workspace: currentWorkspace,
  });
  expect(
    client.getQueryData<unknown>([
      "annotations",
      { sourceId: currentSourceId, stateId: currentStateId },
    ]),
  ).toEqual([{ id: "current-annotation" }]);
});

test("does not replace a newer retained replica with an older completion", async () => {
  const online = Promise.withResolvers<Workspace>();
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({
      annotations: [{ id: "initial-annotation" }],
      hash: "initial-replica",
      positions: [retainedPosition(240)],
      retainedAt: "2026-08-26T10:00:00.000Z",
    });
  const client = testQueryClient();
  const { result } = renderHook(
    () => useReadingWorkspaceOpening({ sourceId, stateId }),
    { wrapper: queryWrapper(client) },
  );
  await waitFor(() =>
    expect(result.current).toMatchObject({
      status: "ready",
      origin: "retained",
    }),
  );
  const newerWorkspace = readingWorkspaceFixture();
  newerWorkspace.reading.source.title = "Newer replica";
  await act(async () => {
    client.setQueryData(
      ["offline-working-set", sourceId, stateId],
      retainedRecord({
        annotations: [{ id: "newer-annotation" }],
        hash: "newer-replica",
        retainedAt: "2026-08-26T12:00:00.000Z",
        workspace: newerWorkspace,
      }),
    );
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(result.current).toMatchObject({ workspace: newerWorkspace }),
  );
  expect(
    client.getQueryData([
      "resume",
      { sourceId, stateId, componentIdentity: "article" },
    ]),
  ).toBeUndefined();
  expect(historySemanticLocation(sourceId, stateId, "article")).toBeUndefined();

  await act(async () => {
    client.setQueryData(
      ["offline-working-set", sourceId, stateId],
      retainedRecord({
        annotations: [{ id: "obsolete-annotation" }],
        hash: "obsolete-replica",
        retainedAt: "2026-08-26T12:00:00.000Z",
      }),
    );
    await Promise.resolve();
  });

  expect(result.current).toMatchObject({ workspace: newerWorkspace });
  expect(
    client.getQueryData<unknown>(["annotations", { sourceId, stateId }]),
  ).toEqual([{ id: "newer-annotation" }]);

  await act(async () => online.resolve(readingWorkspaceFixture()));
  await waitFor(() =>
    expect(result.current).toMatchObject({
      status: "ready",
      origin: "online",
    }),
  );
  expect(
    client.getQueryState(["annotations", { sourceId, stateId }])?.isInvalidated,
  ).toBe(true);
});
