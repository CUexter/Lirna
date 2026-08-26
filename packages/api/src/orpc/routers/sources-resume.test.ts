import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { ReadingPositionOperations } from "../../reading-position/reading-position-contract";
import {
  admittedSourceStatesStub,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";
import {
  readingPosition,
  readingPositionsStub,
  sourcesContext,
} from "./sources.test-support";

describe("Sources resume oRPC router", () => {
  test("returns the latest persisted reading position", async () => {
    const position = readingPosition();
    await expect(
      call(
        sourcesRouter.resume.get,
        {},
        {
          context: sourcesContext(
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

  test("scopes a persisted position to one Source component", async () => {
    let getInput: Parameters<ReadingPositionOperations["get"]>[0];
    const position = readingPosition();
    await expect(
      call(
        sourcesRouter.resume.get,
        { sourceId, stateId, componentIdentity: "article" },
        {
          context: sourcesContext(
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

  test("rejects a partial component scope", async () => {
    await expect(
      call(
        sourcesRouter.resume.get,
        { sourceId },
        {
          context: sourcesContext(
            admittedSourceStatesStub(),
            readingPositionsStub(),
          ),
        },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("saves a validated reading position", async () => {
    let savedInput:
      | Parameters<ReadingPositionOperations["save"]>[0]
      | undefined;
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
          context: sourcesContext(
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
