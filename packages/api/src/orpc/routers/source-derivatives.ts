import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { publicProcedure, unauthenticatedActorId } from "../init";
import {
  derivativeComparisonSchema,
  readingDerivativeCandidateSchema,
} from "./sep-admission-schemas";

const input = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
const notFoundError = { NOT_FOUND: {} };
const activationErrors = { ...notFoundError, CONFLICT: {} };
const activationPreviewSchema = z.object({
  baselineSequence: z.number().int().nonnegative(),
  consequences: derivativeComparisonSchema,
});

export const sourceDerivativesRouter = {
  generate: publicProcedure
    .input(input)
    .output(readingDerivativeCandidateSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/sources/derivatives/candidates",
        operationId: "sources.derivatives.generate",
        summary: "Generate and validate a Reading Derivative candidate",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input: candidateInput }) => {
      const candidate =
        await context.derivativeUpdates.generate(candidateInput);
      if (!candidate)
        throw unavailable("SEP Source-state evidence is unavailable");
      return candidate;
    }),
  previewActivation: publicProcedure
    .input(input.extend({ derivativeId: z.string().uuid() }))
    .output(activationPreviewSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/sources/derivatives/activation-preview",
        operationId: "sources.derivatives.previewActivation",
        summary: "Preview current Reading Derivative activation consequences",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input: previewInput }) => {
      const preview =
        await context.activeReadingDerivatives.previewActivation(previewInput);
      if (preview.status !== "ready")
        throw activationUnavailable(preview.status);
      return {
        baselineSequence: preview.baselineSequence,
        consequences: preview.consequences,
      };
    }),
  activate: publicProcedure
    .input(
      input.extend({
        derivativeId: z.string().uuid(),
        expectedBaselineSequence: z.number().int().nonnegative(),
        expectedConsequences: derivativeComparisonSchema,
        reason: z.string().trim().min(1).max(1_000),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        derivativeId: z.string().uuid(),
        sequence: z.number().int().positive(),
        actorId: z.string(),
        reason: z.string(),
        activatedAt: z.string().datetime(),
        consequences: derivativeComparisonSchema,
      }),
    )
    .errors(activationErrors)
    .meta(
      openapi({
        method: "POST",
        path: "/sources/derivatives/activations",
        operationId: "sources.derivatives.activate",
        summary: "Activate a valid Reading Derivative",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input: activationInput }) => {
      const result = await context.activeReadingDerivatives.activate({
        ...activationInput,
        actorId: unauthenticatedActorId,
      });
      if (result.status === "stale-review")
        throw new ORPCError("CONFLICT", {
          message: "Reading Derivative activation review is stale",
        });
      if (result.status !== "activated")
        throw activationUnavailable(result.status);
      return result.activation;
    }),
};

function unavailable(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}

function activationUnavailable(status: string) {
  const message =
    status === "source-state-not-found"
      ? "Source state is unavailable"
      : status === "candidate-invalid"
        ? "Reading Derivative candidate is invalid"
        : "Reading Derivative candidate is unavailable";
  return unavailable(message);
}
