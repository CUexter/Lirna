import { expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { Context } from "../../context";
import type { ReadingPositionOperations } from "../../reading-position/reading-position-contract";
import {
  admittedSourceStatesStub,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

test("saves semantic identity and legacy pixels in one update", async () => {
  const semanticLocation = readingLocation("article", "article", 240);
  let savedInput: Parameters<ReadingPositionOperations["save"]>[0];
  await call(
    sourcesRouter.resume.save,
    {
      sourceId,
      stateId,
      componentIdentity: "article",
      componentLabel: "Article",
      scrollTop: 240,
      semanticLocation,
    },
    {
      context: context({
        async save(input) {
          savedInput = input;
          return {
            sourceId,
            stateId,
            sourceTitle: "Synthetic Reading Source",
            componentIdentity: "article",
            componentLabel: "Article",
            scrollTop: 240,
            semanticLocation,
            savedAt: "2026-08-18T12:01:00.000Z",
          };
        },
      }),
    },
  );
  expect(savedInput).toMatchObject({ scrollTop: 240, semanticLocation });
});

test("rejects semantic identity combined with another scene's pixels", async () => {
  await expect(
    call(
      sourcesRouter.resume.save,
      {
        sourceId,
        stateId,
        componentIdentity: "article",
        componentLabel: "Article",
        scrollTop: 240,
        semanticLocation: readingLocation("supplement", "article", 100),
      },
      { context: context() },
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

function context(overrides: Partial<ReadingPositionOperations> = {}): Context {
  return {
    activeReadingDerivatives: {} as Context["activeReadingDerivatives"],
    annotations: {} as Context["annotations"],
    citationResolutions: {} as Context["citationResolutions"],
    derivativeUpdates: {} as Context["derivativeUpdates"],
    readingPositions: {
      async get() {
        return undefined;
      },
      async save() {
        return undefined;
      },
      ...overrides,
    },
    sepAdmissions: {} as Context["sepAdmissions"],
    admittedSourceStates: admittedSourceStatesStub(),
  };
}

function readingLocation(
  componentIdentity: string,
  owner: "article" | "publisher-note",
  scrollTop: number,
) {
  return {
    version: 1 as const,
    source: { sourceId, stateId },
    scene: { identity: componentIdentity, componentIdentity, owner },
    block: {
      identity: `content:${componentIdentity}`,
      strategy: "content-fingerprint" as const,
    },
    progress: 0.5,
    fallback: {
      scrollTop,
      blockIndex: 0,
      blockTag: "p",
      textExcerpt: "Publication text",
      authoredAnchor: null,
    },
  };
}
