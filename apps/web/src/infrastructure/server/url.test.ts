import { expect, test } from "bun:test";

import { createServerUrl } from "./url";

test("normalizes trailing slashes on absolute URLs", () => {
  expect(createServerUrl("https://api.example.com/")).toBe(
    "https://api.example.com",
  );
});

test("uses the browser origin for relative URLs", () => {
  expect(
    createServerUrl("/api", {
      window: { location: { origin: "https://app.example.com" } },
    }),
  ).toBe("https://app.example.com/api");
});

test("uses an explicit server URL outside the browser", () => {
  expect(
    createServerUrl("/api", {
      process: { env: { SERVER_URL: "https://server.example.com/" } },
    }),
  ).toBe("https://server.example.com");
});

test("uses the production Vercel URL outside the browser", () => {
  expect(
    createServerUrl("/api", {
      process: {
        env: {
          VERCEL_ENV: "production",
          VERCEL_PROJECT_PRODUCTION_URL: "production.example.com",
          VERCEL_URL: "preview.example.com",
        },
      },
    }),
  ).toBe("https://production.example.com/api");
});

test("uses the preview Vercel URL outside the browser", () => {
  expect(
    createServerUrl("/api", {
      process: {
        env: {
          VERCEL_ENV: "preview",
          VERCEL_URL: "https://preview.example.com/",
          VERCEL_PROJECT_PRODUCTION_URL: "production.example.com",
        },
      },
    }),
  ).toBe("https://preview.example.com/api");
});

test("uses localhost for relative URLs without a hosted runtime", () => {
  expect(createServerUrl("/api", { process: { env: {} } })).toBe(
    "http://localhost:3000/api",
  );
});
