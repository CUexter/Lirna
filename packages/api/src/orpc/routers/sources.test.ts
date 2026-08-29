import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { createOfflineWorkingSetSnapshot } from "../../offline-working-set/offline-working-set";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateFixture,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";
import {
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

  test("reading workspace forwards the server projection", async () => {
    const resolution = citationResolution();
    const source = sourceFixture();
    await expect(
      call(
        sourcesRouter.readingWorkspace,
        { sourceId, stateId },
        {
          context: sourcesContext(
            admittedSourceStatesStub(),
            readingPositionsStub(),
            {
              readingWorkspaces: {
                async read() {
                  return {
                    reading: readingFixture(),
                    state: stateFixture(),
                    source,
                    citationResolutions: [resolution],
                  };
                },
              },
            },
          ),
        },
      ),
    ).resolves.toEqual({
      reading: readingFixture(),
      state: stateFixture(),
      source,
      citationResolutions: [resolution],
    });
  });

  test("reading workspace returns not found when the projection is unavailable", async () => {
    await expect(
      call(
        sourcesRouter.readingWorkspace,
        { sourceId, stateId },
        {
          context: sourcesContext(
            admittedSourceStatesStub(),
            readingPositionsStub(),
          ),
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Reading Derivative is unavailable",
    });
  });

  test("Offline working set delegates one capture operation", async () => {
    const reading = readingFixture();
    const activation = {
      id: "50000000-0000-4000-8000-000000000000",
      derivativeId: "40000000-0000-4000-8000-000000000000",
      sequence: 1,
      actorId: "system:admission",
      reason: "Initial validated derivative",
      activatedAt: "2026-08-25T00:00:00.000Z",
      consequences: {
        semantic: { changedComponents: [] },
        structure: [],
        diagnostics: { added: [], removed: [] },
        relocations: [],
      },
    };
    const state = stateFixture({
      derivatives: [
        {
          id: activation.derivativeId,
          kind: "sep-reading-v1",
          valid: true,
          generation: {
            version: 1,
            parser: { id: "parse5", version: "7.3.0" },
            renderer: { id: "lirna-reading-react", version: "1" },
            inputResourceHashes: reading.provenance.inputResourceHashes,
          },
          validation: { status: "valid", checks: [] },
          createdAt: activation.activatedAt,
          currentActivation: activation,
          activationHistory: [activation],
          provenance: reading.provenance,
        },
      ],
    });
    if (state.capture.limits) state.capture.limits.maxTotalBytes = 1024 * 1024;
    const workspace = {
      reading,
      state,
      source: sourceFixture(),
      citationResolutions: [],
    };
    const snapshot = createOfflineWorkingSetSnapshot({
      workspace,
      annotations: [],
      positions: [],
    });
    let captured: { sourceId: string; stateId: string } | undefined;
    await expect(
      call(
        sourcesRouter.offlineManifest,
        { sourceId, stateId },
        {
          context: sourcesContext(
            admittedSourceStatesStub(),
            readingPositionsStub(),
            {
              offlineWorkingSets: {
                async capture(capturedSourceId, capturedStateId) {
                  captured = {
                    sourceId: capturedSourceId,
                    stateId: capturedStateId,
                  };
                  return { status: "captured", snapshot };
                },
              },
            },
          ),
        },
      ),
    ).resolves.toEqual(snapshot);
    expect(captured).toEqual({ sourceId, stateId });
  });

  test("Offline working set exposes policy refusal as forbidden", async () => {
    await expect(
      call(
        sourcesRouter.offlineManifest,
        { sourceId, stateId },
        {
          context: sourcesContext(
            admittedSourceStatesStub(),
            readingPositionsStub(),
            {
              offlineWorkingSets: {
                async capture() {
                  return {
                    status: "policy-ineligible",
                    reasons: ["rights-reference-only"],
                  };
                },
              },
            },
          ),
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("rights-reference-only"),
    });
  });
});

function sourceFixture() {
  return {
    id: sourceId,
    title: "Test entry",
    admittedAt: "2026-08-18T12:00:00.000Z",
    authors: [],
    publisher: "Stanford Encyclopedia of Philosophy",
    publicationHistory: [],
    kind: "sep" as const,
    stableKey: "sep:test",
    currentStateId: stateId,
    states: [
      {
        id: stateId,
        sequence: 1,
        observationKey: "submitted" as const,
        canonicalUrl: "https://plato.stanford.edu/entries/test/",
        title: "Test entry",
        publisher: "Stanford Encyclopedia of Philosophy",
        admittedAt: "2026-08-18T12:00:00.000Z",
      },
    ],
  };
}
