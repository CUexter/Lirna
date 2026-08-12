import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";

export type ActorKind = "human" | "agent" | "unauthenticated";

export function identifyBearerActor(credentials: {
  humanAccessToken: string;
  serviceAccessToken: string;
}): (c: Context) => ActorKind {
  const human = Buffer.from(credentials.humanAccessToken, "utf8");
  const service = Buffer.from(credentials.serviceAccessToken, "utf8");
  return (c) => {
    const authorization = c.req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) return "unauthenticated";
    const provided = Buffer.from(authorization.slice(7), "utf8");
    if (matches(provided, human)) return "human";
    if (matches(provided, service)) return "agent";
    return "unauthenticated";
  };
}

function matches(provided: Buffer, expected: Buffer): boolean {
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
