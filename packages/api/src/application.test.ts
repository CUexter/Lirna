import { expect, test } from "bun:test";
import "./application.test-env";
import { createApplication, productionApplication } from "./application";
import { createContext } from "./context";
import type { ReadingWorkspaceOperations } from "./reading-workspace/reading-workspace";
import type { ActiveReadingDerivativeOperations } from "./sep-admission/active-reading-derivative";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

test("propagates one active Reading Derivative adapter to every dependent module", async () => {
  const reads: Array<{ sourceId: string; stateId: string }> = [];
  const activeReadingDerivatives: ActiveReadingDerivativeOperations = {
    async read(input) {
      reads.push(input);
      return { status: "no-active-derivative" };
    },
    async previewActivation() {
      return { status: "candidate-not-found" };
    },
    async activate() {
      return { status: "candidate-not-found" };
    },
  };
  const application = createApplication({ activeReadingDerivatives });

  await application.admittedSourceStates.getReading(sourceId, stateId);
  await application.annotations.create({
    sourceId,
    stateId,
    componentIdentity: "article",
    kind: "highlight",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 0,
    normalizedEndOffset: 4,
    exactText: "Test",
    prefix: "",
    suffix: "",
    color: "yellow",
  });
  await application.citationResolutions.evidence(sourceId, stateId);
  await application.readingPositions.save({
    sourceId,
    stateId,
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 0,
  });

  expect(reads).toEqual([
    { sourceId, stateId },
    { sourceId, stateId },
    { sourceId, stateId },
    { sourceId, stateId },
  ]);
});

test("selects production adapters once for the application lifetime", () => {
  const first = createContext({ application: productionApplication });
  const second = createContext({ application: productionApplication });

  expect(second.annotations).toBe(first.annotations);
  expect(second.activeReadingDerivatives).toBe(first.activeReadingDerivatives);
  expect(second.readingWorkspaces).toBe(first.readingWorkspaces);
});

test("accepts an independent Reading workspace test adapter", async () => {
  const readingWorkspaces: ReadingWorkspaceOperations = {
    async read(receivedSourceId, receivedStateId) {
      expect({ receivedSourceId, receivedStateId }).toEqual({
        receivedSourceId: sourceId,
        receivedStateId: stateId,
      });
      return undefined;
    },
  };
  const application = createApplication({ readingWorkspaces });

  await expect(
    application.readingWorkspaces.read(sourceId, stateId),
  ).resolves.toBe(undefined);
});
