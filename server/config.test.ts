import { describe, expect, it } from "vitest";
import { loadApiConfig, loadConfig } from "./config.js";

describe("runtime configuration", () => {
  it("loads worker configuration without human credentials", () => {
    expect(loadConfig({}).databaseUrl).toContain("postgres://");
  });

  it("requires separate API credentials for Nathan and Service identities", () => {
    expect(() => loadApiConfig({})).toThrow(/HUMAN_ACCESS_TOKEN/);
    expect(() =>
      loadApiConfig({
        HUMAN_ACCESS_TOKEN: "human-token-with-at-least-thirty-two-characters",
      }),
    ).toThrow(/SERVICE_ACCESS_TOKEN/);
    const shared = "shared-token-with-at-least-thirty-two-characters";
    expect(() =>
      loadApiConfig({
        HUMAN_ACCESS_TOKEN: shared,
        SERVICE_ACCESS_TOKEN: shared,
      }),
    ).toThrow(/must be different/);
  });
});
