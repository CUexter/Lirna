import { describe, expect, test } from "bun:test";
import { formatServerError } from "./server-error";

describe("formatServerError", () => {
  test("shows validation issues and the request reference", () => {
    const error = Object.assign(new Error("Input validation failed"), {
      data: {
        issues: [
          { path: ["sourceId"], message: "Must be a UUID" },
          { path: ["items", 0], message: "Required" },
        ],
        requestId: "request-123",
      },
    });

    expect(formatServerError(error)).toEqual({
      message:
        "Input validation failed\nsourceId: Must be a UUID\nitems.0: Required\nError reference: request-123",
    });
  });

  test("keeps debug stacks separate from the user-facing message", () => {
    const error = Object.assign(new Error("database connection failed"), {
      data: {
        debug: {
          type: "DatabaseError",
          stack: "DatabaseError: failed\n at db",
        },
        requestId: "request-456",
      },
    });

    expect(formatServerError(error)).toEqual({
      message: "database connection failed\nError reference: request-456",
      technicalDetails: "DatabaseError: failed\n at db",
    });
  });
});
