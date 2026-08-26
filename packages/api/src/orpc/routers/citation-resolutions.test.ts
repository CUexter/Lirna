import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { CitationInferenceOperations } from "../../citation-resolutions/citation-resolution-contract";
import { InvalidCitationResolutionError } from "../../citation-resolutions/citation-resolution-store";
import { citationResolutionsRouter } from "./citation-resolutions";
import {
  citationOperationsStub,
  context,
  createInput,
  mentionEvidence,
  mentionInput,
  record,
  sourceId,
  stateId,
} from "./citation-resolutions.test-support";

describe("Citation resolutions oRPC router", () => {
  test("lists resolutions without authentication", async () => {
    await expect(
      call(
        citationResolutionsRouter.list,
        { sourceId, stateId },
        { context: context(citationOperationsStub()) },
      ),
    ).resolves.toEqual([]);
  });

  test("records manual selections and clears as unauthenticated", async () => {
    const received: unknown[] = [];
    const operations = citationOperationsStub({
      async create(input) {
        received.push(input);
        return record(input);
      },
      async clear(input) {
        received.push(input);
        return true;
      },
    });

    const created = await call(
      citationResolutionsRouter.create,
      createInput(),
      {
        context: context(operations),
      },
    );
    const cleared = await call(
      citationResolutionsRouter.clear,
      mentionInput(),
      {
        context: context(operations),
      },
    );

    expect(received).toEqual([
      expect.objectContaining({
        actorId: "unauthenticated",
        bibliographyEntryId: "entry-one",
      }),
      expect.objectContaining({
        actorId: "unauthenticated",
        mentionId: "citation-one",
      }),
    ]);
    expect(created.method).toBe("manual");
    expect(cleared).toBeTrue();
  });

  test("maps invalid candidates to a bounded bad request", async () => {
    const failures: unknown[] = [];
    const operations = citationOperationsStub({
      async create() {
        throw new InvalidCitationResolutionError();
      },
    });
    await expect(
      call(citationResolutionsRouter.create, createInput(), {
        context: context(operations, { fail: (error) => failures.push(error) }),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { requestId: "req-test" },
    });
    expect(failures[0]).toBeInstanceOf(InvalidCitationResolutionError);
  });

  test("exposes stable bounded evidence and append-only history", async () => {
    const item = record({ ...createInput(), actorId: "user-1" });
    const operations = citationOperationsStub({
      async list() {
        return [item];
      },
      async evidence() {
        return [mentionEvidence()];
      },
      async history() {
        return [{ ...item, action: "selected" }];
      },
    });
    const requestContext = context(operations);
    await expect(
      call(
        citationResolutionsRouter.list,
        { sourceId, stateId },
        { context: requestContext },
      ),
    ).resolves.toEqual([item]);
    await expect(
      call(
        citationResolutionsRouter.evidence,
        { sourceId, stateId },
        { context: requestContext },
      ),
    ).resolves.toEqual([mentionEvidence()]);
    await expect(
      call(
        citationResolutionsRouter.history,
        { sourceId, stateId },
        { context: requestContext },
      ),
    ).resolves.toEqual([{ ...item, action: "selected" }]);
  });

  test("requires execution-time consent and leaves disabled inference non-durable", async () => {
    let createCalls = 0;
    const operations = citationOperationsStub({
      async create() {
        createCalls += 1;
        return undefined;
      },
      async evidence() {
        return [mentionEvidence()];
      },
    });
    await expect(
      call(
        citationResolutionsRouter.infer,
        { ...mentionInput(), consent: false } as never,
        { context: context(operations) },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        citationResolutionsRouter.infer,
        { ...mentionInput(), consent: true },
        { context: context(operations) },
      ),
    ).resolves.toEqual({
      status: "unavailable",
      candidateId: null,
      confidence: null,
      reasoning: "Citation inference is disabled",
    });
    expect(createCalls).toBe(0);
  });

  test("minimizes inference payload and rejects low-confidence or out-of-set output", async () => {
    const inputs: unknown[] = [];
    let result = {
      candidateId: "article:entry-one" as string | null,
      confidence: 0.9,
      reasoning: "The authored year aligns.",
    };
    const inference: CitationInferenceOperations = {
      async infer(input) {
        inputs.push(input);
        return result;
      },
    };
    const operations = citationOperationsStub({
      async evidence() {
        return [mentionEvidence()];
      },
    });
    const request = () =>
      call(
        citationResolutionsRouter.infer,
        { ...mentionInput(), consent: true },
        { context: context(operations, { citationInference: inference }) },
      );

    await expect(request()).resolves.toMatchObject({
      status: "suggested",
      candidateId: "article:entry-one",
    });
    expect(inputs[0]).toEqual({
      mention: {
        label: "Smith 2020",
        context: "See Smith 2020 for the claim.",
      },
      candidates: [
        {
          id: "article:entry-one",
          label: "Smith (2020)",
          text: "Smith. 2020. Entry.",
        },
      ],
    });

    result = {
      candidateId: "article:entry-one",
      confidence: 0.4,
      reasoning: "Uncertain.",
    };
    await expect(request()).resolves.toMatchObject({
      status: "uncertain",
      candidateId: null,
    });
    result = {
      candidateId: "invented",
      confidence: 0.99,
      reasoning: "Invented.",
    };
    await expect(request()).resolves.toMatchObject({
      status: "unavailable",
      candidateId: null,
    });
  });

  test("enforces Source policy before invoking inference", async () => {
    let called = false;
    const operations = citationOperationsStub({
      async evidence() {
        return [
          mentionEvidence({
            policy: {
              rightsBasis: "owned",
              sensitivityLevel: "local-only",
              inferenceEligible: false,
            },
          }),
        ];
      },
    });
    const citationInference: CitationInferenceOperations = {
      async infer() {
        called = true;
        throw new Error("must not run");
      },
    };
    await expect(
      call(
        citationResolutionsRouter.infer,
        { ...mentionInput(), consent: true },
        { context: context(operations, { citationInference }) },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(called).toBeFalse();
  });
});
