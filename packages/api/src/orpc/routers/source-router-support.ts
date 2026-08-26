import { ORPCError } from "@orpc/server";
import type { Context } from "../../context";

export async function requireReading(
  context: Context,
  input: { sourceId: string; stateId: string },
) {
  const reading = await context.admittedSourceStates.getReading(
    input.sourceId,
    input.stateId,
  );
  if (!reading) throw notFound("SEP Reading Derivative is unavailable");
  return reading;
}

export function notFound(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}
