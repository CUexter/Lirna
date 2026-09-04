import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import { z } from "zod";
import {
  authoredTargetInputSchema,
  InvalidAuthoredTargetError,
  validateAuthoredTarget,
} from "../../authored-targets/authored-target";
import {
  defaultResearchAssistantModel,
  researchAssistantModelIds,
} from "../../research-assistant/research-assistant-contract";
import { publicProcedure } from "../init";
import {
  sourceAssistantRegenerateProcedure,
  sourceAssistantSelectProcedure,
} from "./source-assistant-alternatives";
import { sourceAssistantRetryProcedure } from "./source-assistant-retry";
import {
  temporaryAttachment,
  temporaryAttachmentInput,
  temporaryEvidenceDescriptorSchema,
} from "./source-assistant-temporary-evidence";
import {
  answerQuestion,
  requireReadingComponent,
} from "./source-assistant-turn";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound } from "./source-router-support";

const threadScopeInput = sourceStateInput.extend({
  componentIdentity: z.string().trim().min(1).max(2_000),
});
const threadSummarySchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  stateId: z.string().uuid(),
  componentIdentity: z.string(),
  componentLabel: z.string(),
  title: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const citationOccurrenceSchema = z.object({
  answerTarget: z.object({
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  }),
  id: z.string().uuid(),
  presentation: z.enum(["passing", "quote"]),
  relation: z.enum(["supports", "qualifies", "conflicts", "background"]),
  referenceId: z.string().uuid(),
});
const threadMessageSchema = z.object({
  id: z.string().uuid(),
  parentMessageId: z.string().uuid().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  model: z.enum(researchAssistantModelIds).optional(),
  regeneratedFromAnswerId: z.string().uuid().optional(),
  answerAlternatives: z
    .object({
      position: z.number().int().positive(),
      total: z.number().int().positive(),
      previousAnswerId: z.string().uuid().optional(),
      nextAnswerId: z.string().uuid().optional(),
    })
    .optional(),
  selectedText: z.string().optional(),
  temporaryEvidence: z.array(temporaryEvidenceDescriptorSchema).optional(),
  references: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        componentIdentity: z.string(),
        componentLabel: z.string(),
        occurrences: z.array(citationOccurrenceSchema).optional(),
        selection: authoredTargetInputSchema,
      }),
    )
    .optional(),
  createdAt: z.string().datetime(),
});
const threadSchema = threadSummarySchema.extend({
  messages: z.array(threadMessageSchema),
});

export const sourceAssistantRouter = {
  list: publicProcedure
    .input(sourceStateInput)
    .output(z.array(threadSummarySchema))
    .meta(
      openapi({
        method: "GET",
        path: "/sources/assistant/threads",
        operationId: "sources.assistant.list",
        summary: "List Research threads for a Source state",
        tags: ["Sources"],
      }),
    )
    .handler(({ context, input }) => context.researchThreads.list(input)),
  get: publicProcedure
    .input(sourceStateInput.extend({ threadId: z.string().uuid() }))
    .output(threadSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "GET",
        path: "/sources/assistant/threads/{threadId}",
        operationId: "sources.assistant.get",
        summary: "Resume a Research thread",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const thread = await context.researchThreads.projectSelectedPath(input);
      if (!thread) throw notFound("Research thread is unavailable");
      return thread;
    }),
  create: publicProcedure
    .input(
      threadScopeInput.extend({
        question: z.string().trim().min(1).max(4_000),
      }),
    )
    .output(threadSchema)
    .errors(notFoundError)
    .meta(
      openapi({
        method: "POST",
        path: "/sources/assistant/threads",
        operationId: "sources.assistant.create",
        summary: "Create a Research thread",
        tags: ["Sources"],
      }),
    )
    .handler(async ({ context, input }) => {
      const { component } = await requireReadingComponent(context, input);
      return context.researchThreads.create({
        sourceId: input.sourceId,
        stateId: input.stateId,
        componentIdentity: input.componentIdentity,
        componentLabel: component.label,
        title: threadTitle(input.question),
      });
    }),
  regenerate: sourceAssistantRegenerateProcedure,
  selectAnswer: sourceAssistantSelectProcedure,
  retry: sourceAssistantRetryProcedure,
  ask: publicProcedure
    .input(
      sourceStateInput.extend({
        attachments: z.array(temporaryAttachmentInput).max(3).optional(),
        componentIdentity: z.string().trim().min(1).max(2_000),
        model: z
          .enum(researchAssistantModelIds)
          .default(defaultResearchAssistantModel),
        question: z.string().trim().min(1).max(4_000),
        selection: authoredTargetInputSchema.optional(),
        threadId: z.string().uuid(),
      }),
    )
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
      const { reading, component } = await requireReadingComponent(
        context,
        input,
      );
      if (!context.researchTurns) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research assistant is not configured",
        });
      }
      const selectedText = validatedSelectionText(component, input.selection);
      const attachments = input.attachments?.length
        ? input.attachments.map(temporaryAttachment)
        : undefined;
      const thread = await context.researchThreads.projectSelectedPath(input);
      if (!thread) throw notFound("Research thread is unavailable");
      const userMessage = await context.researchThreads.appendQuestion({
        threadId: thread.id,
        content: input.question,
        ...(selectedText ? { selectedText } : {}),
        ...(input.attachments?.length
          ? {
              temporaryEvidence: input.attachments.map(
                ({ filename, mediaType }) => ({ filename, mediaType }),
              ),
            }
          : {}),
      });
      if (!userMessage) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research question could not be persisted",
        });
      }
      const history = await context.researchThreads.historyThroughQuestion({
        threadId: thread.id,
        questionMessageId: userMessage.id,
      });
      if (!history) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research question history could not be resolved",
        });
      }
      const answer = await answerQuestion(context, {
        attachments,
        component,
        expectedSelectedLeafMessageId: userMessage.id,
        history,
        model: input.model,
        question: userMessage,
        reading,
        sourceId: input.sourceId,
        sourceStateId: input.stateId,
        threadId: thread.id,
      });
      return streamToAsyncIteratorObject(answer);
    }),
};

function threadTitle(question: string) {
  return question.length <= 120 ? question : `${question.slice(0, 117)}...`;
}

function validatedSelectionText(
  component: Parameters<typeof validateAuthoredTarget>[0],
  selection: z.infer<typeof authoredTargetInputSchema> | undefined,
) {
  if (!selection) return undefined;
  try {
    validateAuthoredTarget(component, {
      ...selection,
      publisherAnchor: undefined,
    });
  } catch (error) {
    if (!(error instanceof InvalidAuthoredTargetError)) throw error;
    throw new ORPCError("BAD_REQUEST", {
      message: "Selected Source-state evidence no longer matches",
    });
  }
  return selection.exactText;
}
