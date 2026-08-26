import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { Context } from "../../context";
import type { SepAdmissionOperations } from "../../sep-admission/sep-admission";
import { SepAdmissionError } from "../../sep-admission/sep-capture";
import { sepAdmissionsRouter } from "./sep-admission";
import {
  operationsStub,
  previewFixture,
  previewId,
  resultFixture,
  sourceId,
} from "./sep-admission.test-fixtures";

describe("SEP admission oRPC router", () => {
  test("submit maps a SepAdmissionError to a bad-request error", async () => {
    await expect(
      invoke(
        "submit",
        { url: "https://example.com/sep" },
        operationsStub({
          async submit() {
            throw new SepAdmissionError("Enter a valid SEP URL");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Enter a valid SEP URL",
      data: { requestId: "req-test" },
    });
  });

  test("submit forwards a captured preview and trims the url", async () => {
    let submittedUrl: string | undefined;
    let observedRequestId: string | undefined;
    const operations = operationsStub({
      async submit(url, observation) {
        submittedUrl = url;
        observedRequestId = observation?.requestId;
        return previewFixture();
      },
    });

    const result = await invoke(
      "submit",
      { url: "  https://example.com/sep  " },
      operations,
    );

    expect(submittedUrl).toBe("https://example.com/sep");
    expect(observedRequestId).toBe("req-test");
    expect(result).toMatchObject({ id: previewId });
  });

  test("submit rejects an empty url before persistence", async () => {
    let submitCalls = 0;
    const operations = operationsStub({
      async submit() {
        submitCalls += 1;
        return previewFixture();
      },
    });

    await expect(
      invoke("submit", { url: "   " }, operations),
    ).rejects.toThrow();
    expect(submitCalls).toBe(0);
  });

  test("checkUpdate forwards the Source identity without authentication", async () => {
    let checkedSourceId: string | undefined;
    const operations = operationsStub({
      async checkUpdate(candidateSourceId) {
        checkedSourceId = candidateSourceId;
        return previewFixture({
          update: { sourceId, observations: [] },
        });
      },
    });

    await expect(
      invoke("checkUpdate", { sourceId }, operations),
    ).resolves.toMatchObject({ update: { sourceId } });
    expect(checkedSourceId).toBe(sourceId);
  });

  test("submit maps unexpected failures to a referenced internal error", async () => {
    await expect(
      invoke(
        "submit",
        { url: "https://example.com/sep" },
        operationsStub({
          async submit() {
            throw new Error("database connection detail");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      data: { requestId: "req-test" },
    });
  });

  test("get returns not found when the preview is missing", async () => {
    await expect(
      invoke("get", { previewId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
    });
  });

  test("get maps unexpected failures to a referenced internal error", async () => {
    await expect(
      invoke(
        "get",
        { previewId },
        operationsStub({
          async get() {
            throw new Error("database connection detail");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      data: { requestId: "req-test" },
    });
  });

  test("get forwards an existing preview", async () => {
    const operations = operationsStub({
      async get(id) {
        return previewFixture({ id });
      },
    });

    await expect(
      invoke("get", { previewId }, operations),
    ).resolves.toMatchObject({
      id: previewId,
    });
  });

  test("extend returns not found when the preview is missing", async () => {
    await expect(
      invoke("extend", { previewId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
    });
  });

  test("extend maps a SepAdmissionError to a bad-request error", async () => {
    await expect(
      invoke(
        "extend",
        { previewId },
        operationsStub({
          async extend() {
            throw new SepAdmissionError("Preview cannot be extended");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Preview cannot be extended",
    });
  });

  test("retry maps a SepAdmissionError to a bad-request error", async () => {
    await expect(
      invoke(
        "retry",
        { previewId },
        operationsStub({
          async retry() {
            throw new SepAdmissionError("Retry is unavailable");
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Retry is unavailable",
    });
  });

  test("retry returns not found when the preview is missing", async () => {
    await expect(
      invoke("retry", { previewId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
    });
  });

  test("admit maps a SepAdmissionError to a bad-request error", async () => {
    await expect(
      invoke(
        "admit",
        { previewId, observationKeys: ["submitted"] },
        operationsStub({
          async admit() {
            throw new SepAdmissionError(
              "Select at least one observation to admit",
            );
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Select at least one observation to admit",
    });
  });

  test("admit returns not found when the preview is missing", async () => {
    await expect(
      invoke(
        "admit",
        { previewId, observationKeys: ["submitted"] },
        operationsStub(),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
    });
  });

  test("admit forwards observation keys without authentication", async () => {
    let admittedArgs: [string, string[]] | undefined;
    const operations = operationsStub({
      async admit(id, observationKeys) {
        admittedArgs = [id, observationKeys];
        return resultFixture();
      },
    });

    const result = await invoke(
      "admit",
      { previewId, observationKeys: ["submitted", "recommended-archive"] },
      operations,
    );

    expect(admittedArgs).toEqual([
      previewId,
      ["submitted", "recommended-archive"],
    ]);
    expect(result).toMatchObject({ sourceId });
  });

  test("delete returns not found when the preview is missing", async () => {
    await expect(
      invoke("delete", { previewId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
    });
  });

  test("delete forwards a successful deletion", async () => {
    let deletedId: string | undefined;
    const operations = operationsStub({
      async delete(id) {
        deletedId = id;
        return true;
      },
    });

    await expect(invoke("delete", { previewId }, operations)).resolves.toEqual({
      deleted: true,
    });
    expect(deletedId).toBe(previewId);
  });
});

function invoke(
  procedure: keyof typeof sepAdmissionsRouter,
  input: unknown,
  operations: SepAdmissionOperations,
): Promise<unknown> {
  return call(sepAdmissionsRouter[procedure] as never, input, {
    context: context(operations),
  });
}

function context(sepAdmissions: SepAdmissionOperations): Context {
  return {
    activeReadingDerivatives: {} as Context["activeReadingDerivatives"],
    annotations: {} as Context["annotations"],
    citationResolutions: {} as Context["citationResolutions"],
    derivativeUpdates: {} as Context["derivativeUpdates"],
    readingPositions: {} as Context["readingPositions"],
    sepAdmissions,
    admittedSourceStates: {} as Context["admittedSourceStates"],
    observation: {
      requestId: "req-test",
      fail() {},
      emit() {},
    },
  };
}
