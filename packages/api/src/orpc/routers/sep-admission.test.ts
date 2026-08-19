import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";

import type { Context } from "../../context";
import type {
  SepAdmissionOperations,
  SepAdmissionPreview,
  SepAdmissionResult,
  SepAdmittedState,
} from "../../sep-admission/sep-admission";
import { SepAdmissionError } from "../../sep-admission/sep-capture";
import type { SepReadingContract } from "../../sep-admission/sep-reading-contract";
import { sepAdmissionsRouter } from "./sep-admission";

const previewId = "10000000-0000-4000-8000-000000000000";
const sourceId = "20000000-0000-4000-8000-000000000000";
const stateId = "30000000-0000-4000-8000-000000000000";

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
    });
  });

  test("submit forwards a captured preview and trims the url", async () => {
    let submittedUrl: string | undefined;
    const operations = operationsStub({
      async submit(url) {
        submittedUrl = url;
        return previewFixture();
      },
    });

    const result = await invoke(
      "submit",
      { url: "  https://example.com/sep  " },
      operations,
    );

    expect(submittedUrl).toBe("https://example.com/sep");
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

  test("get returns not found when the preview is missing", async () => {
    await expect(
      invoke("get", { previewId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Admission preview is unavailable",
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

  test("admit forwards observation keys to the operation", async () => {
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

  test("state returns not found when the state is missing", async () => {
    await expect(
      invoke("state", { sourceId, stateId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Source state is unavailable",
    });
  });

  test("state forwards an admitted state", async () => {
    const operations = operationsStub({
      async getState(sid, stid) {
        return stateFixture({ id: stid, sourceId: sid });
      },
    });

    await expect(
      invoke("state", { sourceId, stateId }, operations),
    ).resolves.toMatchObject({
      id: stateId,
      sourceId,
    });
  });

  test("reading returns not found when the reading derivative is missing", async () => {
    await expect(
      invoke("reading", { sourceId, stateId }, operationsStub()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "SEP Reading derivative is unavailable",
    });
  });

  test("reading forwards a reading derivative", async () => {
    const operations = operationsStub({
      async getReading() {
        return readingFixture();
      },
    });

    await expect(
      invoke("reading", { sourceId, stateId }, operations),
    ).resolves.toBeDefined();
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
    auth: null,
    session: null,
    annotations: {} as Context["annotations"],
    sepAdmissions,
  };
}

function operationsStub(
  overrides: Partial<SepAdmissionOperations> = {},
): SepAdmissionOperations {
  return {
    async submit() {
      return previewFixture();
    },
    async get() {
      return undefined;
    },
    async extend() {
      return undefined;
    },
    async delete() {
      return false;
    },
    async retry() {
      return undefined;
    },
    async admit() {
      return undefined;
    },
    async getState() {
      return undefined;
    },
    async getReading() {
      return undefined;
    },
    ...overrides,
  };
}

function previewFixture(
  overrides: Partial<SepAdmissionPreview> = {},
): SepAdmissionPreview {
  return { id: previewId, ...overrides } as unknown as SepAdmissionPreview;
}

function resultFixture(
  overrides: Partial<SepAdmissionResult> = {},
): SepAdmissionResult {
  return {
    sourceId,
    states: [],
    ...overrides,
  } as unknown as SepAdmissionResult;
}

function stateFixture(
  overrides: Partial<SepAdmittedState> = {},
): SepAdmittedState {
  return { id: stateId, sourceId, ...overrides } as unknown as SepAdmittedState;
}

function readingFixture(): SepReadingContract {
  return { sourceId, stateId } as unknown as SepReadingContract;
}
