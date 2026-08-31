import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  authoredTargetInputSchema,
  InvalidAuthoredTargetError,
  validateAuthoredTarget,
} from "../../authored-targets/authored-target";
import { publicProcedure } from "../init";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound, requireReading } from "./source-router-support";

export const sourceAssistantRouter = {
  ask: publicProcedure
    .input(
      sourceStateInput.extend({
        componentIdentity: z.string().trim().min(1).max(2_000),
        question: z.string().trim().min(1).max(4_000),
        selection: authoredTargetInputSchema.optional(),
      }),
    )
    .output(z.object({ answer: z.string().min(1) }))
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/sources/assistant",
        operationId: "sources.assistant.ask",
        summary: "Ask a question about an admitted Source state",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const reading = await requireReading(context, input);
      const component = reading.components.find(
        ({ identity }) => identity === input.componentIdentity,
      );
      if (!component) throw notFound("SEP Reading component is unavailable");
      if (!context.researchAssistant) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research assistant is not configured",
        });
      }
      const selectedText = validatedSelectionText(component, input.selection);
      return context.researchAssistant.answer({
        question: input.question,
        sourceTitle: reading.source.title,
        componentLabel: component.label,
        ...(selectedText ? { selectedText } : {}),
        sourceText: component.plainText,
      });
    }),
};

function validatedSelectionText(
  component: Parameters<typeof validateAuthoredTarget>[0],
  selection: z.infer<typeof authoredTargetInputSchema> | undefined,
) {
  if (!selection) return undefined;
  try {
    validateAuthoredTarget(component, selection);
  } catch (error) {
    if (!(error instanceof InvalidAuthoredTargetError)) throw error;
    throw new ORPCError("BAD_REQUEST", {
      message: "Selected Source-state evidence no longer matches",
    });
  }
  return selection.exactText;
}
