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
    .output(derivativeComparisonSchema)
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
      const comparison =
        await context.derivativeUpdates.previewActivation(previewInput);
      if (!comparison)
        throw unavailable("Valid Reading Derivative is unavailable");
      return comparison;
    }),
  activate: publicProcedure
    .input(
      input.extend({
        derivativeId: z.string().uuid(),
        expectedConsequences: derivativeComparisonSchema,
        reason: z.string().trim().min(1).max(1_000),
      }),
    )
    .output(
      z.object({
        id: z.string().uuid(),
        derivativeId: z.string().uuid(),
        actorId: z.string(),
        reason: z.string(),
        activatedAt: z.string().datetime(),
        consequences: derivativeComparisonSchema,
      }),
    )
    .errors(notFoundError)
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
      const activation = await context.derivativeUpdates.activate({
        ...activationInput,
        actorId: unauthenticatedActorId,
      });
      if (!activation)
        throw unavailable("Valid Reading Derivative is unavailable");
      return activation;
    }),
};

function unavailable(message: string) {
  return new ORPCError("NOT_FOUND", { message });
}
