import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { Context } from "../../context";
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
        states: [
          {
            id: stateId,
            sequence: 0,
            observationKey: "submitted" as const,
            canonicalUrl: "https://plato.stanford.edu/entries/test/",
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
      sepAdmissions: {} as Context["sepAdmissions"],
      admittedSourceStates,
    },
  });
}
