import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { queryClientWrapper } from "@/test-support/query-hook";
import { readingWorkspaceFixture } from "./source-information-test-fixture";
import {
  citationResolutionLibraryStub,
  createCitationResolutionHarness,
  type Movement,
  mentionEvidence,
  resolution,
  resolveMutation,
} from "./workspace-citation-resolution-test-support";

const evidence = [
  mentionEvidence("citation-one"),
  mentionEvidence("citation-two"),
];
let createResolution = async (_input: unknown): Promise<unknown> => undefined;

await mock.module("@/clients/library", () =>
  citationResolutionLibraryStub(
    async () => evidence,
    () => createResolution,
  ),
);

const { useWorkspaceCitationResolution } = await import(
  "./workspace-citation-resolution"
);

afterEach(() => {
  cleanup();
  createResolution = async () => undefined;
});

test("keeps active Citation work across scene changes and resets it for another target", async () => {
  const harness = createHarness();
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    {
      initialProps: harness.props(),
      wrapper: queryClientWrapper(harness.client),
    },
  );
  await harness.waitForEvidence(evidence);

  act(() => result.current.openCurrent("entry-one", "citation-one"));
  expect(result.current.resolution?.evidence?.mentionId).toBe("citation-one");

  rerender(
    harness.props({
      component: harness.reading.components[1],
      view: "bibliography",
    }),
  );
  expect(result.current.resolution?.evidence?.mentionId).toBe("citation-one");

  rerender(harness.props({ derivativeId: "another-derivative" }));
  await waitFor(() => expect(result.current.resolution).toBeUndefined());
});

test("keeps active Citation work until cancellation movement commits", async () => {
  let commitCancellation: () => void = () => undefined;
  const harness = createHarness({
    cancel: (onCommit) => {
      commitCancellation = onCommit;
    },
  });
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));

  act(() => result.current.resolution?.onCancel());
  expect(result.current.resolution?.evidence?.mentionId).toBe("citation-one");

  act(() => commitCancellation());
  expect(result.current.resolution).toBeUndefined();
});

test("ignores mutation completion for an obsolete mention", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
  harness.client.setQueryData(harness.workspaceKey, readingWorkspaceFixture());
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  act(() => result.current.openCurrent("entry-two", "citation-two"));

  await resolveMutation(completion, resolution("citation-one"));

  expect(
    harness.client.getQueryData<{ citationResolutions: unknown[] }>(
      harness.workspaceKey,
    )?.citationResolutions,
  ).toEqual([]);
  expect(result.current.resolution?.evidence?.mentionId).toBe("citation-two");
});

test("ignores mutation completion after cancellation commits", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
  harness.client.setQueryData(harness.workspaceKey, readingWorkspaceFixture());
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  act(() => result.current.resolution?.onCancel());

  await resolveMutation(completion, resolution("citation-one"));

  expect(
    harness.client.getQueryData<{ citationResolutions: unknown[] }>(
      harness.workspaceKey,
    )?.citationResolutions,
  ).toEqual([]);
});

test("ignores a completion projected from another Derivative", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
  harness.client.setQueryData(harness.workspaceKey, readingWorkspaceFixture());
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );

  await resolveMutation(completion, {
    ...resolution("citation-one"),
    derivativeId: "obsolete-derivative",
  });

  expect(
    harness.client.getQueryData<{ citationResolutions: unknown[] }>(
      harness.workspaceKey,
    )?.citationResolutions,
  ).toEqual([]);
});

test("routes article, publisher-note, manual, return, and cancel actions through one movement interface", async () => {
  const calls: string[] = [];
  const harness = createHarness({
    activatePassage: (activate) => {
      calls.push("passage");
      activate();
    },
    cancel: () => calls.push("cancel"),
    moveToComponent: (identity) => calls.push(`component:${identity}`),
    openBibliography: (entryId) => calls.push(`bibliography:${entryId}`),
    returnToCitationTarget: (mentionId, componentIdentity) =>
      calls.push(`citation:${componentIdentity}:${mentionId}`),
  });
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);
  const publisherNote = harness.reading.components.find(
    (component) => component.role === "notes",
  );
  if (!publisherNote) throw new Error("Publisher-note fixture is missing");

  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() => result.current.openFrom(publisherNote, undefined, "note-citation"));
  act(() =>
    result.current.openManual("entry-one", "resolution-one", "article"),
  );
  act(() =>
    result.current.returnToMention({
      componentIdentity: "article",
      context: "Synthetic citation context",
      id: "citation-one",
      origin: "authored",
    }),
  );
  act(() =>
    result.current.returnToMention({
      componentIdentity: "article",
      context: "Synthetic resolution context",
      id: "resolution-one",
      origin: "manual-resolution",
      resolution: resolution("citation-one"),
    }),
  );
  act(() => result.current.resolution?.onCancel());

  expect(calls).toEqual([
    "bibliography:entry-one",
    "bibliography:undefined",
    "bibliography:entry-one",
    "citation:article:citation-one",
    "passage",
    "cancel",
  ]);
});

function createHarness(movementOverrides: Partial<Movement> = {}) {
  return createCitationResolutionHarness(movementOverrides);
}
