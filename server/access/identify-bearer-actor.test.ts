import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { identifyBearerActor } from "./identify-bearer-actor.js";

function context(token?: string): Context {
  return {
    req: { header: () => token ? `Bearer ${token}` : undefined },
  } as unknown as Context;
}

describe("bearer actor identity", () => {
  const identify = identifyBearerActor({
    humanAccessToken: "human-token-with-at-least-thirty-two-characters",
    serviceAccessToken: "service-token-with-at-least-thirty-two-characters",
  });

  it("distinguishes Nathan from an authenticated Service identity", () => {
    expect(identify(context("human-token-with-at-least-thirty-two-characters"))).toBe("human");
    expect(identify(context("service-token-with-at-least-thirty-two-characters"))).toBe("agent");
  });

  it("treats absent or unknown credentials as unauthenticated", () => {
    expect(identify(context())).toBe("unauthenticated");
    expect(identify(context("unknown-token-with-at-least-thirty-two-characters"))).toBe("unauthenticated");
  });
});
