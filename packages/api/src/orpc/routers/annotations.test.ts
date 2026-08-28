import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";

import type {
  AnnotationOperations,
  AnnotationRecord,
} from "../../annotations/annotation-contract";
import { InvalidAuthoredTargetError } from "../../authored-targets/authored-target";
import type { Context } from "../../context";
import { createTestContext } from "../application-test-support";
import { annotationsRouter } from "./annotations";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const annotationId = "30000000-0000-4000-8000-000000000000";

describe("annotations oRPC router", () => {
  test("validates and forwards a new annotation", async () => {
    let createdInput: Parameters<AnnotationOperations["create"]>[0] | undefined;
    const operations = operationsStub({
      async create(input) {
        createdInput = input;
        return annotationRecord(input);
      },
    });

    const result = await call(
      annotationsRouter.create,
      {
        sourceId,
        stateId,
        componentIdentity: "article:main",
        kind: "note",
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 4,
        normalizedEndOffset: 12,
        exactText: "evidence",
        prefix: "Read",
        suffix: " carefully.",
        color: "green",
        body: "  A useful note  ",
      },
      { context: context(operations) },
    );

    expect(createdInput).toMatchObject({ body: "A useful note" });
    expect(result).toMatchObject({
      id: annotationId,
      exactText: "evidence",
      color: "green",
    });
  });

  test("rejects an invalid range before persistence", async () => {
    let createCalls = 0;
    const operations = operationsStub({
      async create() {
        createCalls += 1;
        return undefined;
      },
    });

    await expect(
      call(
        annotationsRouter.create,
        {
          sourceId,
          stateId,
          componentIdentity: "article:main",
          kind: "highlight",
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 12,
          normalizedEndOffset: 4,
          exactText: "evidence",
          prefix: "",
          suffix: "",
          color: "yellow",
        },
        { context: context(operations) },
      ),
    ).rejects.toThrow();
    expect(createCalls).toBe(0);
  });

  test("rejects a range that disagrees with its exact text", async () => {
    let createCalls = 0;
    const operations = operationsStub({
      async create() {
        createCalls += 1;
        return undefined;
      },
    });

    await expect(
      call(
        annotationsRouter.create,
        {
          sourceId,
          stateId,
          componentIdentity: "article:main",
          kind: "highlight",
          offsetBasis: "normalized-derivative-text-v1",
          normalizedStartOffset: 4,
          normalizedEndOffset: 12,
          exactText: "shorter",
          prefix: "Read",
          suffix: " carefully.",
          color: "yellow",
        },
        { context: context(operations) },
      ),
    ).rejects.toThrow();
    expect(createCalls).toBe(0);
  });

  test("returns bad request for an anchor rejected by the derivative boundary", async () => {
    const operations = operationsStub({
      async create() {
        throw new InvalidAuthoredTargetError();
      },
    });

    await expect(
      call(annotationsRouter.create, createInput(), {
        context: context(operations),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("lists annotations for a Source state", async () => {
    const record = annotationRecord(createInput());
    const operations = operationsStub({
      async list() {
        return [record];
      },
    });

    await expect(
      call(
        annotationsRouter.list,
        { sourceId, stateId },
        { context: context(operations) },
      ),
    ).resolves.toEqual([record]);
  });

  test("deletes an annotation within its Source state", async () => {
    let deletedArgs: string[] | undefined;
    const operations = operationsStub({
      async delete(...args) {
        deletedArgs = args;
        return true;
      },
    });

    await expect(
      call(
        annotationsRouter.delete,
        { sourceId, stateId, id: annotationId },
        { context: context(operations) },
      ),
    ).resolves.toEqual({ deleted: true });
    expect(deletedArgs).toEqual([sourceId, stateId, annotationId]);
  });

  test("returns not found when deleting outside the Source state", async () => {
    await expect(
      call(
        annotationsRouter.delete,
        { sourceId, stateId, id: annotationId },
        { context: context(operationsStub()) },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("returns not found when an annotation is outside the Source state", async () => {
    await expect(
      call(
        annotationsRouter.update,
        {
          sourceId,
          stateId,
          id: annotationId,
          color: "pink",
          kind: "highlight",
        },
        { context: context(operationsStub()) },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

function context(annotations: AnnotationOperations): Context {
  return createTestContext({ annotations });
}

function operationsStub(
  overrides: Partial<AnnotationOperations> = {},
): AnnotationOperations {
  return {
    async list() {
      return [];
    },
    async create() {
      return undefined;
    },
    async update() {
      return undefined;
    },
    async delete() {
      return false;
    },
    ...overrides,
  };
}

function createInput(): Parameters<AnnotationOperations["create"]>[0] {
  return {
    sourceId,
    stateId,
    componentIdentity: "article:main",
    kind: "note",
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 4,
    normalizedEndOffset: 12,
    exactText: "evidence",
    prefix: "Read",
    suffix: " carefully.",
    color: "green",
    body: "A useful note",
  };
}

function annotationRecord(
  input: Parameters<AnnotationOperations["create"]>[0],
): AnnotationRecord {
  return {
    id: annotationId,
    sourceId: input.sourceId,
    sourceStateId: input.stateId,
    componentIdentity: input.componentIdentity,
    kind: input.kind,
    publisherAnchor: input.publisherAnchor ?? null,
    offsetBasis: input.offsetBasis,
    normalizedStartOffset: input.normalizedStartOffset,
    normalizedEndOffset: input.normalizedEndOffset,
    exactText: input.exactText,
    prefix: input.prefix,
    suffix: input.suffix,
    color: input.color,
    body: input.body ?? null,
    createdAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T12:00:00.000Z",
  };
}
