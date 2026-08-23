import { ORPCError, os } from "@orpc/server";
import type { Context } from "../context";

const base = os.$context<Context>();

const observeUnexpectedErrors = base.middleware(
  async ({ context, next, path }) => {
    try {
      return await next();
    } catch (error) {
      if (
        error instanceof ORPCError &&
        error.code !== "INTERNAL_SERVER_ERROR"
      ) {
        throw error;
      }

      const cause = toError(error);
      emitFailure(context, {
        event: "operation.failed",
        operation: path.join("."),
        outcome: "failure",
        err: cause,
      });
      throw unexpectedError(
        cause,
        context.observation?.requestId,
        context.debugErrors,
      );
    }
  },
);

export const publicProcedure = base.use(observeUnexpectedErrors);

function unexpectedError(
  error: Error,
  requestId: string | undefined,
  exposeDetails = false,
) {
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: exposeDetails ? error.message : "Internal Server Error",
    data: {
      ...(requestId ? { requestId } : {}),
      ...(exposeDetails
        ? {
            debug: {
              type: error.name,
              ...(error.stack ? { stack: error.stack } : {}),
            },
          }
        : {}),
    },
    cause: error,
  });
}

function toError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error(`Non-Error exception: ${String(error)}`);
}

function emitFailure(context: Context, record: Record<string, unknown>) {
  try {
    context.observation?.emit("error", record);
  } catch {
    // Diagnostics must not alter request handling.
  }
}
