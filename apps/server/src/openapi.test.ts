import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/lirna_test";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";

const { app } = await import("./index");

describe("OpenAPI documentation routes", () => {
  test("serves /openapi.json without authentication", async () => {
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openapi).toMatch(/^3\.1/);
    expect(body.info.title).toBe("Lirna API");
    expect(body.paths["/health"]).toBeDefined();
    expect(body.paths["/annotations"]).toBeDefined();
    expect(body.components?.securitySchemes).toBeUndefined();
    expect(body.security).toBeUndefined();
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

  test("serves /docs as HTML without authentication", async () => {
    const response = await app.request("/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("OpenAPI REST routes", () => {
  test("serves the public health endpoint", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toBe("OK");
  });

  test("does not require authentication for annotation requests", async () => {
    const response = await app.request("/annotations");

    expect(response.status).not.toBe(401);
  });
});
