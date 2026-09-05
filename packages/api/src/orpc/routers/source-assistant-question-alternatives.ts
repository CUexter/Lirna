import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { publicProcedure } from "../init";
import {
  requireTemporaryEvidence,
  temporaryAttachment,
  temporaryAttachmentInput,
} from "./source-assistant-temporary-evidence";
import { requireReadingComponent } from "./source-assistant-turn";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound } from "./source-router-support";

const questionAlternativeInput = sourceStateInput.extend({
  expectedSelectedLeafMessageId: z.string().uuid(),
  questionMessageId: z.string().uuid(),
  threadId: z.string().uuid(),
});

export const sourceAssistantReviseQuestionProcedure = publicProcedure
  .input(
    questionAlternativeInput.extend({
      attachments: z.array(temporaryAttachmentInput).max(3).optional(),
      question: z.string().trim().min(1).max(4_000),
    }),
  )
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/revise-question",
      operationId: "sources.assistant.reviseQuestion",
      summary: "Revise a Research question on the selected path",
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
    const original = thread.messages.find(
      ({ id, role }) => id === input.questionMessageId && role === "user",
    );
    if (!original) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a question on the current selected path can be revised",
      });
    }
    if (original.content === input.question) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The revised Research question must be different",
      });
    }
    const suppliedAttachments = input.attachments ?? [];
    requireTemporaryEvidence(
      original.temporaryEvidence ?? [],
      suppliedAttachments,
      "regenerating from the revised question",
    );
    suppliedAttachments.map(temporaryAttachment);
    await requireReadingComponent(context, {
      ...input,
      componentIdentity: thread.componentIdentity,
    });
    const revised = await context.researchThreads.reviseQuestion({
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: input.expectedSelectedLeafMessageId,
      content: input.question,
    });
    if (!revised) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The selected Research-thread branch changed; reload and try again",
      });
    }
    const selected = await context.researchThreads.projectSelectedPath(input);
    if (!selected) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Revised Research thread could not be reloaded",
      });
    }
    return selected;
  });

export const sourceAssistantReviseQuestionWithHistoryProcedure = publicProcedure
  .input(
    questionAlternativeInput.extend({
      question: z.string().trim().min(1).max(4_000),
    }),
  )
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/revise-question-with-history",
      operationId: "sources.assistant.reviseQuestionWithHistory",
      summary: "Revise a Research question while preserving selected history",
      tags: ["Sources"],
    }),
  )
  .handler(async ({ context, input }) => {
    const thread = await context.researchThreads.projectSelectedPath(input);
    if (!thread) throw notFound("Research thread is unavailable");
    const original = thread.messages.find(
      ({ id, role }) => id === input.questionMessageId && role === "user",
    );
    if (!original) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a question on the current selected path can be revised",
      });
    }
    if (original.content === input.question) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The revised Research question must be different",
      });
    }
    const copiedLeaf = await context.researchThreads.reviseQuestionWithHistory({
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: input.expectedSelectedLeafMessageId,
      content: input.question,
    });
    if (!copiedLeaf) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The selected Research-thread branch changed; reload and try again",
      });
    }
    const selected = await context.researchThreads.projectSelectedPath(input);
    if (!selected) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Revised Research thread could not be reloaded",
      });
    }
    return selected;
  });

export const sourceAssistantSelectQuestionProcedure = publicProcedure
  .input(questionAlternativeInput)
  .errors(notFoundError)
  .meta(
    openapi({
      method: "POST",
      path: "/sources/assistant/select-question",
      operationId: "sources.assistant.selectQuestion",
      summary: "Select a Research question alternative",
      tags: ["Sources"],
    }),
  )
  .handler(async ({ context, input }) => {
    const current = await context.researchThreads.projectSelectedPath(input);
    if (!current) throw notFound("Research thread is unavailable");
    if (!(await context.researchThreads.selectQuestionAlternative(input))) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The Research question selection changed; reload and try again",
      });
    }
    const selected = await context.researchThreads.projectSelectedPath(input);
    if (!selected) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Selected Research thread could not be reloaded",
      });
    }
    return selected;
  });
