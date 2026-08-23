import { describe, expect, test } from "bun:test";
import pino from "pino";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/lirna_test";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { app, createApp, shouldExposeDebugErrors } = await import("./index");

describe("server HTTP API", () => {
  test("returns the public health-check result through oRPC", async () => {
    const response = await app.request("/orpc/healthCheck");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: "OK" });
  });

  test("returns oRPC data without a session", async () => {
    const response = await app.request("/orpc/privateData");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ json: { user: null } });
  });

  test("rejects /docs without a session", async () => {
    const response = await app.request("/docs");

    expect(response.status).toBe(401);
  });

  test("rejects /openapi.json without a session", async () => {
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(401);
  });

  test("emits one safe correlated request completion record", async () => {
    const records: Array<Record<string, unknown>> = [];
    const logger = pino(
      { level: "info" },
      { write: (line) => records.push(JSON.parse(line)) },
    );
    const observedApp = createApp({
      logger,
      createRequestId: () => "req-test",
    });

    const response = await observedApp.request("/?private=query-value", {
      headers: { authorization: "secret", cookie: "session=secret" },
    });

    expect(response.headers.get("x-request-id")).toBe("req-test");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "request.completed",
      requestId: "req-test",
      method: "GET",
      route: "/",
      status: 200,
      outcome: "success",
    });
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("query-value");
    expect(serialized).not.toContain("secret");
  });

  test("emits failed requests at error level", async () => {
    const records: Array<Record<string, unknown>> = [];
    const logger = pino(
      { level: "info" },
      { write: (line) => records.push(JSON.parse(line)) },
    );
    const observedApp = createApp({
      logger,
      createRequestId: () => "req-failure",
    });
    observedApp.get("/failure", () => {
      throw new Error("private failure detail");
    });

    const response = await observedApp.request("/failure");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      requestId: "req-failure",
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 50,
      event: "request.completed",
      requestId: "req-failure",
      status: 500,
      outcome: "failure",
      err: {
        type: "Error",
        message: "private failure detail",
      },
    });
    expect(records[0]?.err).toMatchObject({
      stack: expect.stringContaining("private failure detail"),
    });
  });

  test("never exposes debug errors in production", () => {
    expect(shouldExposeDebugErrors(true, "development")).toBe(true);
    expect(shouldExposeDebugErrors(true, "production")).toBe(false);
  });
});
