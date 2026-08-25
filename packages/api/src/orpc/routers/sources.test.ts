// biome-ignore lint/style/noExcessiveLinesPerFile: Router tests share compact context and operation stubs.
import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { CitationResolutionOperations } from "../../citation-resolutions/citation-resolution-contract";
import type { Context } from "../../context";
import type {
  ReadingPositionOperations,
  ReadingPositionRecord,
} from "../../reading-position/reading-position-contract";
import type { SepAdmittedStateOperations } from "../../sep-admission/sep-admitted-state";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateFixture,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

describe("Sources oRPC router", () => {
  test("list forwards admitted Sources without authentication", async () => {
    const sources = [
      {
        id: sourceId,
        title: "Synthetic SEP entry",
        admittedAt: "2026-08-18T12:01:00.000Z",
        authors: ["Synthetic Author"],
        publisher: "Synthetic Press",
        publicationHistory: ["First published 2024"],
        kind: "sep" as const,
        stableKey: "sep:test",
        currentStateId: stateId,
        states: [
          {
            id: stateId,
            sequence: 0,
            observationKey: "submitted" as const,
            canonicalUrl: "https://plato.stanford.edu/entries/test/",
            title: "Synthetic SEP entry",
            publisher: "Synthetic Press",
            admittedAt: "2026-08-18T12:01:00.000Z",
          },
        ],
      },
    ];

    await expect(
      invoke(
        "list",
        {},
        admittedSourceStatesStub({
          async listSources() {
            return sources;
          },
        }),
        null,
      ),
    ).resolves.toEqual(sources);
  });

  test("delete removes an admitted Source", async () => {
    let deletedSourceId: string | undefined;
    await expect(
      invoke(
        "delete",
        { sourceId },
        admittedSourceStatesStub({
          async deleteSource(input) {
            deletedSourceId = input;
            return true;
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(deletedSourceId).toBe(sourceId);
  });

  test("delete returns not found when the Source is missing", async () => {
    await expect(invoke("delete", { sourceId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Source is unavailable",
    });
  });

  test("state returns not found when the Source state is missing", async () => {
    await expect(invoke("state", { sourceId, stateId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Source state is unavailable",
    });
  });

  test("state forwards an admitted Source state", async () => {
    await expect(
      invoke(
        "state",
        { sourceId, stateId },
        admittedSourceStatesStub({
          async getState(sid, stid) {
            return stateFixture({ id: stid, sourceId: sid });
          },
        }),
      ),
    ).resolves.toMatchObject({ id: stateId, sourceId });
  });

  test("reading returns not found when the Derivative is missing", async () => {
    await expect(
      invoke("reading", { sourceId, stateId }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Reading Derivative is unavailable",
    });
  });

  test("reading forwards a reading Derivative", async () => {
    await expect(
      invoke(
        "reading",
        { sourceId, stateId },
        admittedSourceStatesStub({
          async getReading() {
            return readingFixture();
          },
        }),
      ),
    ).resolves.toBeDefined();
  });

  test("reading workspace composes the Derivative and Citation resolutions", async () => {
    const resolution = citationResolution();
    await expect(
      call(
        sourcesRouter.readingWorkspace,
        { sourceId, stateId },
        {
          context: {
            ...context(admittedSourceStatesStub(), readingPositionsStub()),
            admittedSourceStates: admittedSourceStatesStub({
              async getWorkspace() {
                return { reading: readingFixture(), state: stateFixture() };
              },
              async listSources() {
                return [
                  {
                    id: sourceId,
                    title: "Test entry",
                    admittedAt: "2026-08-18T12:00:00.000Z",
                    authors: [],
                    publisher: "Stanford Encyclopedia of Philosophy",
                    publicationHistory: [],
                    kind: "sep",
                    stableKey: "sep:test",
                    currentStateId: stateId,
                    states: [
                      {
                        id: stateId,
                        sequence: 1,
                        observationKey: "submitted",
                        canonicalUrl:
                          "https://plato.stanford.edu/entries/test/",
                        title: "Test entry",
                        publisher: "Stanford Encyclopedia of Philosophy",
                        admittedAt: "2026-08-18T12:00:00.000Z",
                      },
                    ],
                  },
                ];
              },
            }),
            citationResolutions: citationResolutionsStub({
              async list() {
                return [resolution];
              },
            }),
          },
        },
      ),
    ).resolves.toMatchObject({ citationResolutions: [resolution] });
  });

  test("reading workspace keeps a legacy text Source readable without first-class state metadata", async () => {
    const legacySource = {
      id: sourceId,
      title: "Legacy SEP text",
      admittedAt: "2026-08-18T12:00:00.000Z",
      authors: [],
      publisher: "",
      publicationHistory: [],
      kind: "legacy-sep-text" as const,
      currentStateId: stateId,
      states: [
        {
          id: stateId,
          sequence: 0,
          observationKey: "submitted" as const,
          canonicalUrl: "",
          title: "Legacy SEP text",
          publisher: "",
          admittedAt: "2026-08-18T12:00:00.000Z",
        },
      ],
    };

    await expect(
      call(
        sourcesRouter.readingWorkspace,
        { sourceId, stateId },
        {
          context: {
            ...context(admittedSourceStatesStub(), readingPositionsStub()),
            admittedSourceStates: admittedSourceStatesStub({
              async getReading() {
                return readingFixture();
              },
              async listSources() {
                return [legacySource];
              },
            }),
            citationResolutions: citationResolutionsStub(),
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        reading: expect.any(Object),
        source: legacySource,
      }),
    );
  });

  test("resume returns the latest persisted reading position", async () => {
    const position = readingPosition();
    await expect(
      call(
        sourcesRouter.resume.get,
        {},
        {
          context: context(
            admittedSourceStatesStub(),
            readingPositionsStub({
              async get() {
                return position;
              },
            }),
          ),
        },
      ),
    ).resolves.toEqual(position);
  });

  test("resume scopes a persisted position to one Source component", async () => {
    let getInput: Parameters<ReadingPositionOperations["get"]>[0];
    const position = readingPosition();
    await expect(
      call(
        sourcesRouter.resume.get,
        { sourceId, stateId, componentIdentity: "article" },
        {
          context: context(
            admittedSourceStatesStub(),
            readingPositionsStub({
              async get(input) {
                getInput = input;
                return position;
              },
            }),
          ),
        },
      ),
    ).resolves.toEqual(position);
    expect(getInput).toEqual({
      sourceId,
      stateId,
      componentIdentity: "article",
    });
  });

  test("resume rejects a partial component scope", async () => {
    await expect(
      call(
        sourcesRouter.resume.get,
        { sourceId },
        {
          context: context(admittedSourceStatesStub(), readingPositionsStub()),
        },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("resume saves a validated reading position", async () => {
    let savedInput: Parameters<ReadingPositionOperations["save"]>[0];
    const position = readingPosition();
    await expect(
      call(
        sourcesRouter.resume.save,
        {
          sourceId,
          stateId,
          componentIdentity: "article",
          componentLabel: "Article",
          scrollTop: 240,
        },
        {
          context: context(
            admittedSourceStatesStub(),
            readingPositionsStub({
              async save(input) {
                savedInput = input;
                return position;
              },
            }),
          ),
        },
      ),
    ).resolves.toEqual(position);
    expect(savedInput).toMatchObject({ sourceId, stateId, scrollTop: 240 });
  });
});

function invoke(
  procedure: keyof typeof sourcesRouter,
  input: unknown,
  admittedSourceStates: SepAdmittedStateOperations = admittedSourceStatesStub(),
  session: Context["session"] = {} as NonNullable<Context["session"]>,
): Promise<unknown> {
  return call(sourcesRouter[procedure] as never, input, {
    context: {
      auth: null,
      session,
      annotations: {} as Context["annotations"],
      readingPositions: {} as Context["readingPositions"],
      sepAdmissions: {} as Context["sepAdmissions"],
      admittedSourceStates,
    },
  });
}

function context(
  admittedSourceStates: SepAdmittedStateOperations,
  readingPositions: ReadingPositionOperations,
): Context {
  return {
    auth: null,
    session: { user: { id: "user-1" } } as NonNullable<Context["session"]>,
    annotations: {} as Context["annotations"],
    citationResolutions: {} as Context["citationResolutions"],
    readingPositions,
    sepAdmissions: {} as Context["sepAdmissions"],
    admittedSourceStates,
  };
}

function readingPositionsStub(
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

function readingPosition(): ReadingPositionRecord {
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

function citationResolutionsStub(
  overrides: Partial<CitationResolutionOperations> = {},
): CitationResolutionOperations {
  return {
    async list() {
      return [];
    },
    async history() {
      return [];
    },
    async evidence() {
      return [];
    },
    async create() {
      return undefined;
    },
    async clear() {
      return false;
    },
    ...overrides,
  };
}

function citationResolution() {
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
