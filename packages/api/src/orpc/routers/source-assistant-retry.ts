import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import { z } from "zod";

import {
  defaultResearchAssistantModel,
  researchAssistantModelIds,
} from "../../research-assistant/research-assistant-contract";
import { publicProcedure } from "../init";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound } from "./source-router-support";
import {
  requireTemporaryEvidence,
  temporaryAttachment,
  temporaryAttachmentInput,
} from "./source-assistant-temporary-evidence";
import {
  answerQuestion,
  requireReadingComponent,
} from "./source-assistant-turn";

export const sourceAssistantRetryProcedure = publicProcedure
  .input(
    sourceStateInput.extend({
      attachments: z.array(temporaryAttachmentInput).max(3).optional(),
      model: z
        .enum(researchAssistantModelIds)
        .default(defaultResearchAssistantModel),
      questionMessageId: z.string().uuid(),
      threadId: z.string().uuid(),
    }),
  )
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/retry",
      operationId: "sources.assistant.retry",
      summary: "Retry an unanswered Research question",
      tags: ["Sources"],
    }),
  )
  .handler(async ({ context, input }) => {
    if (!context.researchTurns) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Research assistant is not configured",
      });
    }
    const thread = await context.researchThreads.projectSelectedPath(input);
    if (!thread) throw notFound("Research thread is unavailable");
    const question = thread.messages.at(-1);
    if (
      question?.id !== input.questionMessageId ||
      question.role !== "user" ||
      (
        await context.researchThreads.listChildren({
          threadId: thread.id,
          parentMessageId: input.questionMessageId,
        })
      ).some(({ role }) => role === "assistant")
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Only the selected unanswered Research question can be retried",
      });
    }
    const suppliedAttachments = input.attachments ?? [];
    requireTemporaryEvidence(
      question.temporaryEvidence ?? [],
      suppliedAttachments,
    );
    const { reading, component } = await requireReadingComponent(context, {
      ...input,
      componentIdentity: thread.componentIdentity,
    });
    const history = await context.researchThreads.historyThroughQuestion({
      threadId: thread.id,
      questionMessageId: question.id,
    });
    if (!history) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Research question history could not be resolved",
      });
    }
    const answer = await answerQuestion(context, {
      attachments: suppliedAttachments.map(temporaryAttachment),
      component,
      history,
      model: input.model,
      question,
      reading,
      sourceId: input.sourceId,
      sourceStateId: input.stateId,
      threadId: thread.id,
    });
    return streamToAsyncIteratorObject(answer);
  });
