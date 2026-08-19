import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/lirna_test";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";

const { app } = await import("./index");

describe("server HTTP API", () => {
  test("returns the public health-check result through tRPC", async () => {
    const response = await app.request("/trpc/healthCheck");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { data: "OK" } });
  });

  test("rejects protected data without a session", async () => {
    const response = await app.request("/trpc/privateData");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: -32001, data: { code: "UNAUTHORIZED" } },
    });
  });

  test("returns the public health-check result through oRPC", async () => {
    const response = await app.request("/orpc/healthCheck");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: "OK" });
  });

  test("rejects protected oRPC data without a session", async () => {
    const response = await app.request("/orpc/privateData");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      json: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  });
});
