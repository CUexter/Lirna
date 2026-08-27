import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { InvalidCitationResolutionError } from "../../citation-resolutions/citation-resolution-store";
import type { Context } from "../../context";
import { publicProcedure, unauthenticatedActorId } from "../init";
import {
  citationMentionEvidenceSchema,
  citationResolutionDecisionSchema,
  citationResolutionSchema,
} from "./citation-resolution-schema";

const sourceStateInput = z.object({
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
});
const mentionInput = sourceStateInput.extend({
  componentIdentity: z.string().trim().min(1).max(2_000),
  mentionId: z.string().trim().min(1).max(2_000),
});
const selectionInput = mentionInput.extend({
  bibliographyComponentIdentity: z.string().trim().min(1).max(2_000),
  bibliographyEntryId: z.string().trim().min(1).max(2_000),
  method: z.enum(["manual", "inferred"]).default("manual"),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().trim().min(1).max(1_000).optional(),
});

const inferenceOutput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("suggested"),
    candidateId: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
  z.object({
    status: z.enum(["uncertain", "refused", "unavailable"]),
    candidateId: z.null(),
    confidence: z.number().min(0).max(1).nullable(),
    reasoning: z.string(),
  }),
]);

export const citationResolutionsRouter = {
  list: publicProcedure
    .input(sourceStateInput)
    .output(z.array(citationResolutionSchema))
    .meta(
      operation(
        "GET",
        "/citation-resolutions",
        "citationResolutions.list",
        "List Citation resolutions for a Source state",
      ),
    )
    .handler(({ context, input }) =>
      context.citationResolutions.list(input.sourceId, input.stateId),
    ),

  evidence: publicProcedure
    .input(sourceStateInput)
    .output(z.array(citationMentionEvidenceSchema))
    .errors({ NOT_FOUND: {} })
    .meta(
      operation(
        "GET",
        "/citation-resolutions/evidence",
        "citationResolutions.evidence",
        "List unresolved Citation mention evidence",
      ),
    )
    .handler(async ({ context, input }) => {
      return requireEvidence(context, input);
    }),

  history: publicProcedure
    .input(sourceStateInput)
    .output(z.array(citationResolutionDecisionSchema))
    .meta(
      operation(
        "GET",
        "/citation-resolutions/history",
        "citationResolutions.history",
        "List Citation resolution decision history",
      ),
    )
    .handler(({ context, input }) =>
      context.citationResolutions.history(input.sourceId, input.stateId),
    ),

  create: publicProcedure
    .input(selectionInput)
    .output(citationResolutionSchema)
    .errors({ NOT_FOUND: {}, BAD_REQUEST: {} })
    .meta(
      operation(
        "POST",
        "/citation-resolutions",
        "citationResolutions.create",
        "Select or correct a Citation resolution",
      ),
    )
    .handler(async ({ context, input }) =>
      handleInvalid(context, async () => {
        const created = await context.citationResolutions.create({
          ...input,
          actorId: unauthenticatedActorId,
        });
        if (!created) throw notFound(context);
        return created;
      }),
    ),

  clear: publicProcedure
    .input(mentionInput)
    .output(z.boolean())
    .errors({ NOT_FOUND: {}, BAD_REQUEST: {} })
    .meta(
      operation(
        "POST",
        "/citation-resolutions/clear",
        "citationResolutions.clear",
        "Clear a Citation resolution",
      ),
    )
    .handler(async ({ context, input }) =>
      handleInvalid(context, async () => {
        const cleared = await context.citationResolutions.clear({
          ...input,
          actorId: unauthenticatedActorId,
        });
        if (cleared === undefined) throw notFound(context);
        return cleared;
      }),
    ),

  infer: publicProcedure
    .input(mentionInput.extend({ consent: z.literal(true) }))
    .output(inferenceOutput)
    .errors({ NOT_FOUND: {}, FORBIDDEN: {} })
    .meta(
      operation(
        "POST",
        "/citation-resolutions/infer",
        "citationResolutions.infer",
        "Suggest a bounded Citation candidate",
      ),
    )
    .handler(async ({ context, input }) => {
      const evidence = await requireEvidence(context, input);
      const mention = evidence.find(
        (item) =>
          item.componentIdentity === input.componentIdentity &&
          item.mentionId === input.mentionId,
      );
      if (!mention) throw notFound(context);
      if (!mention.policy.citationInference.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: `Source handling policy does not permit this inference: ${mention.policy.citationInference.reasons.join(", ")}`,
        });
      }
      if (!context.citationInference) {
        return unavailable("Citation inference is disabled");
      }
      try {
        const result = await context.citationInference.infer({
          mention: { label: mention.label, context: mention.context },
          candidates: mention.candidates.map(({ id, label, text }) => ({
            id,
            label,
            text,
          })),
        });
        if (result.candidateId === null) {
          return {
            status: "refused" as const,
            candidateId: null,
            confidence: result.confidence,
            reasoning: result.reasoning,
          };
        }
        if (
          !mention.candidates.some((item) => item.id === result.candidateId)
        ) {
          return unavailable("Provider returned an invalid candidate");
        }
        if (result.confidence < 0.7) {
          return {
            status: "uncertain" as const,
            candidateId: null,
            confidence: result.confidence,
            reasoning: result.reasoning,
          };
        }
        return {
          status: "suggested" as const,
          candidateId: result.candidateId,
          confidence: result.confidence,
          reasoning: result.reasoning,
        };
      } catch {
        return unavailable(
          "Citation inference could not produce a safe suggestion",
        );
      }
    }),
};

async function requireEvidence(
  context: Context,
  input: { sourceId: string; stateId: string },
) {
  const evidence = await context.citationResolutions.evidence(
    input.sourceId,
    input.stateId,
  );
  if (!evidence) throw notFound(context);
  return evidence;
}

function operation(
  method: "GET" | "POST",
  path: `/${string}`,
  operationId: string,
  summary: string,
) {
  return openapi({
    method,
    path,
    operationId,
    summary,
    tags: ["Citation resolutions"],
  });
}

async function handleInvalid<T>(
  context: Context,
  operationCall: () => Promise<T>,
) {
  try {
    return await operationCall();
  } catch (error) {
    if (error instanceof InvalidCitationResolutionError) {
      context.observation?.fail(error);
      throw new ORPCError("BAD_REQUEST", {
        message: error.message,
        cause: error,
        data: { requestId: context.observation?.requestId ?? "unknown" },
      });
    }
    throw error;
  }
}

function notFound(context: { observation?: { requestId: string } }) {
  return new ORPCError("NOT_FOUND", {
    message:
      "Source state, Reading derivative, or Citation mention is unavailable",
    data: { requestId: context.observation?.requestId ?? "unknown" },
  });
}

function unavailable(reasoning: string) {
  return {
    status: "unavailable" as const,
    candidateId: null,
    confidence: null,
    reasoning,
  };
}
