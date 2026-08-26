import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateFixture,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";
import {
  citationOperationsStub,
  citationResolution,
  invoke,
  readingPositionsStub,
  sourcesContext,
} from "./sources.test-support";

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
            ...sourcesContext(
              admittedSourceStatesStub(),
              readingPositionsStub(),
            ),
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
            citationResolutions: citationOperationsStub({
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
            ...sourcesContext(
              admittedSourceStatesStub(),
              readingPositionsStub(),
            ),
            admittedSourceStates: admittedSourceStatesStub({
              async getReading() {
                return readingFixture();
              },
              async listSources() {
                return [legacySource];
              },
            }),
            citationResolutions: citationOperationsStub(),
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
});
