import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import { z } from "zod";

import {
  defaultResearchAssistantModel,
  researchAssistantModelIds,
} from "../../research-assistant/research-assistant-contract";
import { publicProcedure } from "../init";
import {
  requireTemporaryEvidence,
  temporaryAttachment,
  temporaryAttachmentInput,
} from "./source-assistant-temporary-evidence";
import {
  answerQuestion,
  requireReadingComponent,
} from "./source-assistant-turn";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound } from "./source-router-support";

const alternativeInput = sourceStateInput.extend({
  answerMessageId: z.string().uuid(),
  expectedSelectedLeafMessageId: z.string().uuid(),
  threadId: z.string().uuid(),
});

export const sourceAssistantRegenerateProcedure = publicProcedure
  .input(
    alternativeInput.extend({
      attachments: z.array(temporaryAttachmentInput).max(3).optional(),
      model: z
        .enum(researchAssistantModelIds)
        .default(defaultResearchAssistantModel),
    }),
  )
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/regenerate",
      operationId: "sources.assistant.regenerate",
      summary: "Regenerate a completed Research answer",
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
    const selectedLeaf = thread.messages.at(-1);
    const answer = thread.messages.find(
      ({ id, role }) => id === input.answerMessageId && role === "assistant",
    );
    const question = answer?.parentMessageId
      ? thread.messages.find(
          ({ id, role }) => id === answer.parentMessageId && role === "user",
        )
      : undefined;
    if (
      !answer ||
      !question ||
      selectedLeaf?.id !== input.expectedSelectedLeafMessageId
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Only an answer on the current selected path can be regenerated",
      });
    }
    const suppliedAttachments = input.attachments ?? [];
    requireTemporaryEvidence(
      question.temporaryEvidence ?? [],
      suppliedAttachments,
      "regenerating",
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
    const regenerated = await answerQuestion(context, {
      attachments: suppliedAttachments.map(temporaryAttachment),
      component,
      expectedSelectedLeafMessageId: input.expectedSelectedLeafMessageId,
      history,
      model: input.model,
      question,
      reading,
      regeneratedFromAnswerId: answer.id,
      sourceId: input.sourceId,
      sourceStateId: input.stateId,
      threadId: thread.id,
    });
    return streamToAsyncIteratorObject(regenerated);
  });

export const sourceAssistantSelectProcedure = publicProcedure
  .input(alternativeInput)
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/select-answer",
      operationId: "sources.assistant.selectAnswer",
      summary: "Select a Research answer alternative",
      tags: ["Sources"],
    }),
  )
  .handler(async ({ context, input }) => {
    const current = await context.researchThreads.projectSelectedPath(input);
    if (!current) throw notFound("Research thread is unavailable");
    const selected =
      await context.researchThreads.selectAnswerAlternative(input);
    if (!selected) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The Research answer selection changed; reload and try again",
      });
    }
    const thread = await context.researchThreads.projectSelectedPath(input);
    if (!thread) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Selected Research thread could not be reloaded",
      });
    }
    return thread;
  });
