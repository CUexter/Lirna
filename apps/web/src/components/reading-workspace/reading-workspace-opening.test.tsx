import { afterEach, expect, test } from "bun:test";
import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

import { AppShellCompatibilityError } from "@/offline-working-set/app-shell-compatibility";
import {
  historySemanticLocation,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import { sourceId, stateId } from "./reading-test-fixtures";
import {
  hydrateRetainedWorkspace,
  openingReads,
  queryWrapper,
  retainedPosition,
  retainedRecord,
  testQueryClient,
  useReadingWorkspaceOpening,
  type Workspace,
} from "./reading-workspace-opening-test-support";
import { readingWorkspaceFixture } from "./source-information-test-fixture";

afterEach(() => {
  onlineManager.setOnline(true);
  window.history.replaceState({}, "");
});

test("publishes a retained Reading workspace only after adjacent state is hydrated", async () => {
  const online = Promise.withResolvers<Workspace>();
  const workspace = readingWorkspaceFixture();
  const annotations = [{ id: "annotation-1" }];
  const position = retainedPosition(240);
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({
      annotations,
      hash: "retained-one",
      positions: [position],
      workspace,
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
      workspace,
    }),
  );
  expect(
    client.getQueryData<unknown>(["annotations", { sourceId, stateId }]),
  ).toEqual(annotations);
  expect(
    client.getQueryData<unknown>([
      "resume",
      { sourceId, stateId, componentIdentity: "article" },
    ]),
  ).toEqual(position);
  expect(historySemanticLocation(sourceId, stateId, "article")).toEqual(
    position.semanticLocation,
  );
});

test("opens a retained Reading workspace while the browser is offline", async () => {
  onlineManager.setOnline(false);
  openingReads.retained = async () => retainedRecord({ hash: "offline" });
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
});

test("retained hydration preserves a newer locally recorded position", async () => {
  const online = Promise.withResolvers<Workspace>();
  const retained = retainedPosition(240);
  const local = {
    ...retainedPosition(640),
    savedAt: "2026-08-27T12:00:00.000Z",
  };
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({ hash: "older-retained-position", positions: [retained] });
  const client = testQueryClient();
  const positionKey = [
    "resume",
    { sourceId, stateId, componentIdentity: "article" },
  ];
  client.setQueryData(positionKey, local);
  if (!local.semanticLocation) throw new Error("Position fixture is semantic");
  writeReadingHistoryPosition(
    JSON.stringify([sourceId, stateId, "article"]),
    local.semanticLocation,
    local.savedAt,
  );

  renderHook(() => useReadingWorkspaceOpening({ sourceId, stateId }), {
    wrapper: queryWrapper(client),
  });

  await waitFor(() =>
    expect(client.getQueryData<typeof local>(positionKey)).toEqual(local),
  );
  expect(historySemanticLocation(sourceId, stateId, "article")).toEqual(
    local.semanticLocation,
  );
});

test("repeat retained hydration preserves progress written after the first hydration", () => {
  const client = testQueryClient();
  const positionKey = [
    "resume",
    { sourceId, stateId, componentIdentity: "article" },
  ];
  const reading = retainedRecord({
    hash: "retained-position",
    positions: [retainedPosition(240)],
  }) as Parameters<typeof hydrateRetainedWorkspace>[0]["reading"];
  hydrateRetainedWorkspace({
    queryClient: client,
    reading,
    retainedKey: "first-retention",
    sourceId,
    stateId,
    targetKey: JSON.stringify([sourceId, stateId]),
  });
  const local = {
    ...retainedPosition(640),
    savedAt: "2026-08-27T12:00:00.000Z",
  };
  client.setQueryData(positionKey, local);
  writeReadingHistoryPosition(
    JSON.stringify([sourceId, stateId, "article"]),
    local.semanticLocation,
    local.savedAt,
  );

  hydrateRetainedWorkspace({
    queryClient: client,
    reading,
    retainedKey: "second-retention",
    sourceId,
    stateId,
    targetKey: JSON.stringify([sourceId, stateId]),
  });

  expect(client.getQueryData<typeof local>(positionKey)).toEqual(local);
  expect(historySemanticLocation(sourceId, stateId, "article")).toEqual(
    local.semanticLocation,
  );
});

test("reports shell incompatibility while the online read is paused offline", async () => {
  onlineManager.setOnline(false);
  openingReads.retained = async () => {
    throw new AppShellCompatibilityError(
      "Application shell version 1 cannot read persisted Offline working-set version 2. Retained data was preserved.",
    );
  };
  const client = testQueryClient();
  const { result } = renderHook(
    () => useReadingWorkspaceOpening({ sourceId, stateId }),
    { wrapper: queryWrapper(client) },
  );

  await waitFor(() =>
    expect(result.current).toEqual({
      status: "unavailable",
      reason: "retained-incompatible",
      message:
        "Application shell version 1 cannot read persisted Offline working-set version 2. Retained data was preserved.",
    }),
  );
});

test("withdraws retained readiness when shell compatibility is lost", async () => {
  onlineManager.setOnline(false);
  openingReads.retained = async () => retainedRecord({ hash: "compatible" });
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

  openingReads.retained = async () => {
    throw new AppShellCompatibilityError(
      "The updated application shell is incompatible. Retained data was preserved.",
    );
  };
  await act(async () =>
    client.invalidateQueries({
      queryKey: ["offline-working-set", sourceId, stateId],
    }),
  );

  await waitFor(() =>
    expect(result.current).toEqual({
      status: "unavailable",
      reason: "retained-incompatible",
      message:
        "The updated application shell is incompatible. Retained data was preserved.",
    }),
  );
});

test("prefers an online Reading workspace without hydrating retained state", async () => {
  const onlineWorkspace = readingWorkspaceFixture();
  const retainedWorkspace = readingWorkspaceFixture();
  retainedWorkspace.reading.source.title = "Retained title";
  openingReads.online = async () => onlineWorkspace;
  openingReads.retained = async () =>
    retainedRecord({
      annotations: [{ id: "retained-annotation" }],
      hash: "retained-two",
      workspace: retainedWorkspace,
    });
  const client = testQueryClient();
  const { result } = renderHook(
    () => useReadingWorkspaceOpening({ sourceId, stateId }),
    { wrapper: queryWrapper(client) },
  );

  await waitFor(() =>
    expect(result.current).toMatchObject({
      status: "ready",
      origin: "online",
      workspace: onlineWorkspace,
    }),
  );
  expect(
    client.getQueryData(["annotations", { sourceId, stateId }]),
  ).toBeUndefined();
});

test("invalidates retained adjacent state before online recovery is published", async () => {
  const online = Promise.withResolvers<Workspace>();
  const onlineWorkspace = readingWorkspaceFixture();
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({
      annotations: [{ id: "retained-annotation" }],
      hash: "retained-three",
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

  await act(async () => online.resolve(onlineWorkspace));

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

test("rolls back failed retained hydration while online opening continues", async () => {
  const online = Promise.withResolvers<Workspace>();
  const existingAnnotations = [{ id: "online-annotation" }];
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({
      annotations: [{ id: "retained-annotation" }],
      hash: "retained-four",
      positions: [retainedPosition(0)],
    });
  const client = testQueryClient();
  const annotationKey = ["annotations", { sourceId, stateId }];
  client.setQueryData(annotationKey, existingAnnotations);
  void client.invalidateQueries({ exact: true, queryKey: annotationKey });
  const annotationState = client.getQueryState(annotationKey);
  const replaceState = window.history.replaceState;
  let rejectedWrite = false;
  window.history.replaceState = function replacement() {
    rejectedWrite = true;
    throw new Error("History unavailable");
  };
  try {
    const { result } = renderHook(
      () => useReadingWorkspaceOpening({ sourceId, stateId }),
      { wrapper: queryWrapper(client) },
    );

    await waitFor(() => expect(rejectedWrite).toBe(true));
    expect(result.current).toEqual({ status: "opening" });
    expect(client.getQueryData<unknown>(annotationKey)).toEqual(
      existingAnnotations,
    );
    expect(client.getQueryState(annotationKey)).toEqual(annotationState);
    await act(async () => online.reject(new Error("Network unavailable")));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "unavailable",
        reason: "unreachable",
      }),
    );
  } finally {
    window.history.replaceState = replaceState;
  }
});

test("removes unchanged positions omitted by replacement hydration", async () => {
  const online = Promise.withResolvers<Workspace>();
  const initialAnnotations = [{ id: "initial-annotation" }];
  const initialPosition = retainedPosition(240);
  openingReads.online = () => online.promise;
  openingReads.retained = async () =>
    retainedRecord({
      annotations: initialAnnotations,
      hash: "initial-replacement",
      positions: [initialPosition],
      retainedAt: "2026-08-26T10:00:00.000Z",
    });
  const client = testQueryClient();
  renderHook(() => useReadingWorkspaceOpening({ sourceId, stateId }), {
    wrapper: queryWrapper(client),
  });
  const annotationKey = ["annotations", { sourceId, stateId }];
  const positionKey = [
    "resume",
    { sourceId, stateId, componentIdentity: "article" },
  ];
  await waitFor(() =>
    expect(client.getQueryData<unknown>(positionKey)).toEqual(initialPosition),
  );

  await act(async () => {
    client.setQueryData(
      ["offline-working-set", sourceId, stateId],
      retainedRecord({
        annotations: [{ id: "replacement-annotation" }],
        hash: "replacement",
        retainedAt: "2026-08-26T12:00:00.000Z",
      }),
    );
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(client.getQueryData<unknown>(annotationKey)).toEqual([
      { id: "replacement-annotation" },
    ]),
  );
  expect(client.getQueryData<unknown>(positionKey)).toBeUndefined();
  expect(historySemanticLocation(sourceId, stateId, "article")).toBeUndefined();
});
