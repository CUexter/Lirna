import { call } from "@orpc/server";
import type { Context } from "../../context";
import type {
  ReadingPositionOperations,
  ReadingPositionRecord,
} from "../../reading-position/reading-position-contract";
import type { SepAdmittedStateOperations } from "../../sep-admission/sep-admitted-state";
import {
  admittedSourceStatesStub,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

export { citationOperationsStub } from "./citation-resolutions.test-support";

export function invoke(
  procedure: "list" | "delete" | "state" | "reading",
  input: unknown,
  admittedSourceStates: SepAdmittedStateOperations = admittedSourceStatesStub(),
): Promise<unknown> {
  return call(sourcesRouter[procedure] as never, input, {
    context: {
      annotations: {} as Context["annotations"],
      readingPositions: {} as Context["readingPositions"],
      sepAdmissions: {} as Context["sepAdmissions"],
      admittedSourceStates,
    },
  });
}

export function sourcesContext(
  admittedSourceStates: SepAdmittedStateOperations,
  readingPositions: ReadingPositionOperations,
): Context {
  return {
    annotations: {} as Context["annotations"],
    citationResolutions: {} as Context["citationResolutions"],
    derivativeUpdates: {} as Context["derivativeUpdates"],
    readingPositions,
    sepAdmissions: {} as Context["sepAdmissions"],
    admittedSourceStates,
  };
}

export function readingPositionsStub(
  overrides: Partial<ReadingPositionOperations> = {},
): ReadingPositionOperations {
  return {
    async get() {
      return undefined;
    },
    async save() {
      return undefined;
    },
    ...overrides,
  };
}

export function readingPosition(): ReadingPositionRecord {
  return {
    sourceId,
    stateId,
    sourceTitle: "Synthetic Reading Source",
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 240,
    savedAt: "2026-08-18T12:01:00.000Z",
  };
}

export function citationResolution() {
  return {
    id: "40000000-0000-4000-8000-000000000000",
    sourceId,
    sourceStateId: stateId,
    derivativeId: "50000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    mentionId: "citation-one",
    bibliographyComponentIdentity: "active:/",
    bibliographyEntryId: "entry-one",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1" as const,
    normalizedStartOffset: 0,
    normalizedEndOffset: 4,
    exactText: "Test",
    prefix: "",
    suffix: "",
    actorId: "user-1",
    method: "manual" as const,
    confidence: null,
    reasoning: null,
    createdAt: "2026-08-18T12:01:00.000Z",
    updatedAt: "2026-08-18T12:01:00.000Z",
  };
}
