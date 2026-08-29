import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  citationResolutionLibraryStub,
  createCitationResolutionHarness,
  derivativeId,
  resolution,
} from "./workspace-citation-resolution-test-support";

const evidence: unknown[] = [];
await mock.module("@/clients/library", () =>
  citationResolutionLibraryStub(async () => evidence),
);
const { useWorkspaceCitationResolution } = await import(
  "./workspace-citation-resolution"
);

afterEach(cleanup);

test("does not retain a rejected cross-component passage return", async () => {
  const activations: string[] = [];
  const harness = createCitationResolutionHarness((transition) => {
    if (transition.kind === "passage") activations.push("activate");
    return true;
  });
  const supplement = requireSupplement(harness.reading.components);
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    { initialProps: harness.props(), wrapper: harness.queryWrapper },
  );
  await harness.waitForEvidence(evidence);

  act(() => result.current.returnToMention(returnMention(supplement.identity)));
  rerender(harness.props({ component: supplement }));

  expect(activations).toEqual([]);
});

test("does not install a delayed passage return after the target changes", async () => {
  const activations: string[] = [];
  let commitMovement: () => void = () => undefined;
  const harness = createCitationResolutionHarness((transition, onCommit) => {
    if (transition.kind === "passage") activations.push("activate");
    if (transition.kind === "component" && onCommit) commitMovement = onCommit;
    return true;
  });
  const supplement = requireSupplement(harness.reading.components);
  const { result, rerender } = renderHook(
    (props) => useWorkspaceCitationResolution(props),
    { initialProps: harness.props(), wrapper: harness.queryWrapper },
  );
  await harness.waitForEvidence(evidence);
  act(() => result.current.returnToMention(returnMention(supplement.identity)));

  rerender(harness.props({ derivativeId: "another-derivative" }));
  act(() => commitMovement());
  rerender(harness.props({ component: supplement, derivativeId }));

  expect(activations).toEqual([]);
});

function requireSupplement(
  components: ReturnType<
    typeof createCitationResolutionHarness
  >["reading"]["components"],
) {
  const supplement = components.find(
    (component) => component.identity === "supplement-one",
  );
  if (!supplement) throw new Error("Supplement fixture is missing");
  return supplement;
}

function returnMention(componentIdentity: string) {
  return {
    componentIdentity,
    context: "Supplement resolution context",
    id: "resolution-one",
    origin: "manual-resolution" as const,
    resolution: { ...resolution("citation-one"), componentIdentity },
  };
}
