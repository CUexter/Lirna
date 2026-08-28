import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { queryClientWrapper } from "@/test-support/query-hook";
import { readingWorkspaceFixture } from "./source-information-test-fixture";
import {
  citationResolutionLibraryStub,
  createCitationResolutionHarness,
  derivativeId,
  mentionEvidence,
  resolution,
} from "./workspace-citation-resolution-test-support";

const evidence = [
  mentionEvidence("citation-one"),
  mentionEvidence("citation-two"),
];
let createResolution = async (_input: unknown): Promise<unknown> => undefined;
let inferResolution = async (): Promise<unknown> => ({
  status: "unavailable",
  candidateId: null,
  confidence: null,
  reasoning: "Provider unavailable",
});
let readEvidence = async (): Promise<unknown> => evidence;

await mock.module("@/clients/library", () =>
  citationResolutionLibraryStub(
    () => readEvidence(),
    () => createResolution,
    () => inferResolution(),
  ),
);
const { useWorkspaceCitationResolution } = await import(
  "./workspace-citation-resolution"
);

afterEach(() => {
  cleanup();
  createResolution = async () => undefined;
  inferResolution = async () => ({
    status: "unavailable",
    candidateId: null,
    confidence: null,
    reasoning: "Provider unavailable",
  });
  readEvidence = async () => evidence;
});

test("keeps opened Citation work pending until current online evidence arrives", async () => {
  const pendingEvidence = Promise.withResolvers<unknown>();
  readEvidence = () => pendingEvidence.promise;
  const harness = createCitationResolutionHarness();
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );

  act(() => result.current.openCurrent("entry-one", "citation-one"));
  expect(result.current.resolution).toMatchObject({
    availability: "pending",
    mentionId: "citation-one",
  });

  await act(async () => {
    pendingEvidence.resolve(evidence);
    await pendingEvidence.promise;
  });
  await expectReady(result);
});

test("keeps unavailable Citation work retryable and cancellable", async () => {
  readEvidence = async () => [];
  const harness = createCitationResolutionHarness();
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence([]);

  act(() => result.current.openCurrent("entry-one", "citation-one"));
  expect(result.current.resolution).toMatchObject({
    availability: "unavailable",
    mentionId: "citation-one",
  });

  readEvidence = async () => evidence;
  act(() => result.current.resolution?.onRetryEvidence?.());
  await expectReady(result);

  act(() => result.current.resolution?.onCancel());
  expect(result.current.resolution).toBeUndefined();
});

test("removes write actions when refreshing cached evidence fails", async () => {
  const harness = createCitationResolutionHarness();
  const evidenceKey = citationEvidenceKey(harness);
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  await expectReady(result);

  readEvidence = async () => {
    throw new Error("Citation evidence refresh failed");
  };
  await act(async () => {
    await harness.client.refetchQueries({ exact: true, queryKey: evidenceKey });
  });

  await waitFor(() =>
    expect(result.current.resolution).toMatchObject({
      availability: "unavailable",
      message: "Citation evidence refresh failed",
    }),
  );
  expect(result.current.resolution?.onSelect).toBeUndefined();
});

test("permits retained Citation inspection without cached write actions", () => {
  let evidenceReads = 0;
  readEvidence = async () => {
    evidenceReads += 1;
    return evidence;
  };
  const harness = createCitationResolutionHarness();
  harness.client.setQueryData(citationEvidenceKey(harness), evidence);
  const { result } = renderHook(
    () =>
      useWorkspaceCitationResolution(
        harness.props({ evidenceAccess: "retained" }),
      ),
    { wrapper: queryClientWrapper(harness.client) },
  );

  act(() => result.current.openCurrent("entry-one", "citation-one"));

  expect(result.current.resolution).toMatchObject({
    availability: "unavailable",
    mentionId: "citation-one",
  });
  expect(result.current.resolution?.onSelect).toBeUndefined();
  expect(result.current.resolution?.onClear).toBeUndefined();
  expect(result.current.resolution?.onInfer).toBeUndefined();
  expect(evidenceReads).toBe(0);
});

test("preserves confirmed projection and active work when a selection fails", async () => {
  createResolution = async () => {
    throw new Error("Selection could not be saved");
  };
  const harness = createCitationResolutionHarness();
  const workspace = readingWorkspaceFixture();
  harness.client.setQueryData(harness.workspaceKey, workspace);
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));

  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  await waitFor(() =>
    expect(result.current.resolution).toMatchObject({
      availability: "ready",
      failure: "Selection could not be saved",
    }),
  );
  expect(
    harness.client.getQueryData<typeof workspace>(harness.workspaceKey),
  ).toEqual(workspace);

  createResolution = async () => resolution("citation-one");
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  await waitFor(() =>
    expect(
      harness.client.getQueryData<{ citationResolutions: unknown[] }>(
        harness.workspaceKey,
      )?.citationResolutions,
    ).toHaveLength(1),
  );
});

test("clears an obsolete authored-action failure when another action succeeds", async () => {
  inferResolution = async () => {
    throw new Error("Inference request failed");
  };
  createResolution = async () => resolution("citation-one");
  const harness = createCitationResolutionHarness();
  harness.client.setQueryData(harness.workspaceKey, readingWorkspaceFixture());
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));

  act(() => result.current.resolution?.onInfer?.());
  await waitFor(() =>
    expect(result.current.resolution).toMatchObject({
      failure: "Inference request failed",
    }),
  );

  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  await waitFor(() =>
    expect(result.current.resolution).toMatchObject({
      availability: "ready",
      failure: undefined,
    }),
  );
  expect(
    harness.client.getQueryData<{ citationResolutions: unknown[] }>(
      harness.workspaceKey,
    )?.citationResolutions,
  ).toHaveLength(1);
});

function citationEvidenceKey(
  harness: ReturnType<typeof createCitationResolutionHarness>,
) {
  return [
    "citation-evidence",
    {
      expectedDerivativeId: derivativeId,
      sourceId: harness.reading.source.id,
      stateId: harness.reading.source.stateId,
    },
  ];
}

async function expectReady(result: {
  current: ReturnType<typeof useWorkspaceCitationResolution>;
}) {
  await waitFor(() =>
    expect(result.current.resolution).toMatchObject({
      availability: "ready",
      evidence: { mentionId: "citation-one" },
    }),
  );
}
