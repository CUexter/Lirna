import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { createTestContext } from "./application-test-support";
import { publicProcedure } from "./init";

describe("oRPC error boundary", () => {
  test("observes and safely converts an unexpected failure", async () => {
    const records: Record<string, unknown>[] = [];
    const failure = new Error("database connection failed");
    const procedure = publicProcedure.handler(() => {
      throw failure;
    });

    await expect(
      call(procedure, undefined, {
        context: requestContext({
          observation: {
            requestId: "request-123",
            fail() {},
            emit(level, record) {
              records.push({ level, ...record });
            },
          },
        }),
        path: ["annotations", "list"],
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      data: { requestId: "request-123" },
    });
    expect(records).toEqual([
      {
        level: "error",
        event: "operation.failed",
        operation: "annotations.list",
        outcome: "failure",
        err: failure,
      },
    ]);
  });

  test("includes exception details when debug errors are enabled", async () => {
    const failure = new Error("database connection failed");
    const procedure = publicProcedure.handler(() => {
      throw failure;
    });

    await expect(
      call(procedure, undefined, {
        context: requestContext({ debugErrors: true }),
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "database connection failed",
      data: {
        debug: {
          type: "Error",
          stack: expect.stringContaining("database connection failed"),
        },
      },
    });
  });
});

function requestContext(options: Parameters<typeof createTestContext>[1] = {}) {
  return createTestContext({}, options);
}
