import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { queryClientWrapper } from "@/test-support/query-hook";
import {
  citationResolutionLibraryStub,
  createCitationResolutionHarness,
  mentionEvidence,
  type RequestTransition,
  resolution,
  resolveMutation,
} from "./workspace-citation-resolution-test-support";

const evidence = [
  mentionEvidence("citation-one"),
  mentionEvidence("citation-two"),
];
let createResolution = async (_input: unknown): Promise<unknown> => undefined;
let clearResolution = async (_input: unknown): Promise<unknown> => true;

await mock.module("@/clients/library", () =>
  citationResolutionLibraryStub(
    async () => evidence,
    () => createResolution,
    undefined,
    () => clearResolution,
  ),
);

const { useWorkspaceCitationResolution } = await import(
  "./workspace-citation-resolution"
);

afterEach(() => {
  cleanup();
  createResolution = async () => undefined;
  clearResolution = async () => true;
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
  const harness = createHarness((transition, onCommit) => {
    if (transition.kind === "article" && onCommit)
      commitCancellation = onCommit;
    return true;
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

test("does not publish a confirmed selection after another mention opens", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
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

  expect(result.current.citationResolutions).toEqual([]);
  expect(result.current.resolution?.evidence?.mentionId).toBe("citation-two");
});

test("does not publish a confirmed selection after cancellation commits", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
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

  expect(result.current.citationResolutions).toEqual([]);
});

test("ignores a completion projected from another Derivative", async () => {
  const completion = Promise.withResolvers<unknown>();
  createResolution = () => completion.promise;
  const harness = createHarness();
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

  expect(result.current.citationResolutions).toEqual([]);
});

test("publishes clearing only after the write is confirmed", async () => {
  const completion = Promise.withResolvers<unknown>();
  const reconciliation = Promise.withResolvers<void>();
  clearResolution = () => completion.promise;
  const confirmed = resolution("citation-one");
  const harness = createHarness();
  harness.client.invalidateQueries = () => reconciliation.promise;
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    {
      initialProps: harness.props({ citationResolutions: [confirmed] }),
      wrapper: queryClientWrapper(harness.client),
    },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));

  act(() => result.current.resolution?.onClear?.());
  expect(result.current.citationResolutions).toEqual([confirmed]);

  await resolveMutation(completion, true);
  expect(result.current.citationResolutions).toEqual([]);

  rerender(harness.props({ citationResolutions: [] }));
  await act(async () => {
    reconciliation.resolve();
    await reconciliation.promise;
  });
  expect(result.current.citationResolutions).toEqual([]);
});

test("allows one decision per mention while superseding obsolete work", async () => {
  const completions = {
    "citation-one": Promise.withResolvers<unknown>(),
    "citation-two": Promise.withResolvers<unknown>(),
  };
  let calls = 0;
  createResolution = (input) => {
    calls += 1;
    const mentionId = (input as { mentionId: keyof typeof completions })
      .mentionId;
    return completions[mentionId].promise;
  };
  const harness = createHarness();
  harness.client.invalidateQueries = () => new Promise<void>(() => undefined);
  const { result } = renderHook(
    () => useWorkspaceCitationResolution(harness.props()),
    { wrapper: queryClientWrapper(harness.client) },
  );
  await harness.waitForEvidence(evidence);

  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() => {
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never);
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never);
  });
  act(() => result.current.openCurrent("entry-two", "citation-two"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[1]?.candidates[0] as never),
  );

  await waitFor(() => expect(calls).toBe(2));
  await resolveMutation(
    completions["citation-one"],
    resolution("citation-one"),
  );
  await resolveMutation(
    completions["citation-two"],
    resolution("citation-two"),
  );
  expect(
    result.current.citationResolutions.map((item) => item.mentionId).sort(),
  ).toEqual(["citation-two"]);
});

test("does not let an older server projection reverse a newer clear", async () => {
  const selected = resolution("citation-one");
  const reconciliation = Promise.withResolvers<void>();
  createResolution = async () => selected;
  const harness = createHarness();
  harness.client.invalidateQueries = () => reconciliation.promise;
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    {
      initialProps: harness.props(),
      wrapper: queryClientWrapper(harness.client),
    },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  await waitFor(() =>
    expect(result.current.citationResolutions).toEqual([selected]),
  );
  act(() => result.current.resolution?.onClear?.());
  await waitFor(() => expect(result.current.citationResolutions).toEqual([]));

  rerender(harness.props({ citationResolutions: [selected] }));
  expect(result.current.citationResolutions).toEqual([]);

  rerender(harness.props({ citationResolutions: [] }));
  await act(async () => {
    reconciliation.resolve();
    await reconciliation.promise;
  });
  expect(result.current.citationResolutions).toEqual([]);
});

test("retires a local consequence after the server projection reconciles", async () => {
  const selected = resolution("citation-one");
  const newerSelection = {
    ...selected,
    id: "60000000-0000-4000-8000-000000000000",
    bibliographyEntryId: "entry-newer",
  };
  const reconciliation = Promise.withResolvers<void>();
  createResolution = async () => selected;
  const harness = createHarness();
  harness.client.invalidateQueries = () => reconciliation.promise;
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    {
      initialProps: harness.props(),
      wrapper: queryClientWrapper(harness.client),
    },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.openCurrent("entry-one", "citation-one"));
  act(() =>
    result.current.resolution?.onSelect?.(evidence[0]?.candidates[0] as never),
  );
  await waitFor(() =>
    expect(result.current.citationResolutions).toEqual([selected]),
  );

  rerender(harness.props({ citationResolutions: [newerSelection] }));
  expect(result.current.citationResolutions).toEqual([selected]);

  await act(async () => {
    reconciliation.resolve();
    await reconciliation.promise;
  });

  await waitFor(() =>
    expect(result.current.citationResolutions).toEqual([newerSelection]),
  );
});

test("routes article, publisher-note, manual, return, and cancel actions through scene transitions", async () => {
  const calls: string[] = [];
  const harness = createHarness((transition) => {
    if (transition.kind === "passage") {
      calls.push("passage");
      transition.activate();
    }
    if (transition.kind === "article") calls.push("cancel");
    if (transition.kind === "component")
      calls.push(`component:${transition.identity}`);
    if (transition.kind === "bibliography")
      calls.push(`bibliography:${transition.entryId}`);
    if (transition.kind === "citation")
      calls.push(
        `citation:${transition.targetComponentIdentity}:${transition.mentionId}`,
      );
    return true;
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

function createHarness(requestTransition?: RequestTransition) {
  return createCitationResolutionHarness(requestTransition);
}
