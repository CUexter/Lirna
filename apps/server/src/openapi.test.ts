import { describe, expect, mock, test } from "bun:test";

let mockSession: { user: { id: string } } | null = null;

await mock.module("@lirna/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
    handler: () => new Response("ok"),
  },
}));

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/lirna_test";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";

const { app } = await import("./index");

describe("OpenAPI documentation routes (authenticated)", () => {
  test("serves /openapi.json with a valid session", async () => {
    mockSession = { user: { id: "test-user" } };
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openapi).toMatch(/^3\.1/);
    expect(body.info.title).toBe("Lirna API");
    expect(body.paths["/health"]).toBeDefined();
    expect(body.paths["/annotations"]).toBeDefined();
    expect(body.components.securitySchemes.sessionCookie.name).toBe(
      "better-auth.session_token",
    );
    expect(body.components.securitySchemes.secureSessionCookie.name).toBe(
      "__Secure-better-auth.session_token",
    );
    expect(body.paths["/health"].get.security).toEqual([]);
    expect(
      body.paths["/health"].get.responses["200"].content["application/json"]
        .schema,
    ).toBeDefined();
    expect(body.paths["/annotations"].get.responses["401"]).toBeUndefined();
    expect(
      body.paths["/annotations/{id}"].patch.responses["404"],
    ).toBeDefined();
  });

  test("serves /docs as HTML with a valid session", async () => {
    mockSession = { user: { id: "test-user" } };
    const response = await app.request("/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("OpenAPI REST routes", () => {
  test("serves the public health endpoint", async () => {
    mockSession = null;
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toBe("OK");
  });

  test("does not reject annotation requests for missing authentication", async () => {
    mockSession = null;
    const response = await app.request("/annotations");

    expect(response.status).not.toBe(401);
  });
});
