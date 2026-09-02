import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import { z } from "zod";
import {
  authoredTargetInputSchema,
  InvalidAuthoredTargetError,
  validateAuthoredTarget,
} from "../../authored-targets/authored-target";
import { researchAnswerHistoryContent } from "../../research-assistant/research-answer-markers";
import {
  defaultResearchAssistantModel,
  researchAssistantModelIds,
} from "../../research-assistant/research-assistant-contract";
import { publicProcedure } from "../init";
import { researchAssistantAnswerOptions } from "./research-assistant-observation";
import { notFoundError, sourceStateInput } from "./source-router-contracts";
import { notFound, requireReading } from "./source-router-support";

const attachmentMediaTypes = [
  "application/json",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;
const temporaryAttachmentInput = z.object({
  dataUrl: z.string().max(7_000_000),
  filename: z.string().trim().min(1).max(255),
  mediaType: z.enum(attachmentMediaTypes),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(5 * 1024 * 1024),
});
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
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  selectedText: z.string().optional(),
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
      const thread = await context.researchThreads.get(input);
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
      const reading = await requireReading(context, input);
      const component = reading.components.find(
        ({ identity }) => identity === input.componentIdentity,
      );
      if (!component) throw notFound("SEP Reading component is unavailable");
      return context.researchThreads.create({
        sourceId: input.sourceId,
        stateId: input.stateId,
        componentIdentity: input.componentIdentity,
        componentLabel: component.label,
        title: threadTitle(input.question),
      });
    }),
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
      const reading = await requireReading(context, input);
      const component = reading.components.find(
        ({ identity }) => identity === input.componentIdentity,
      );
      if (!component) throw notFound("SEP Reading component is unavailable");
      if (!context.researchTurns) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research assistant is not configured",
        });
      }
      const selectedText = validatedSelectionText(component, input.selection);
      const attachments = input.attachments?.length
        ? input.attachments.map(temporaryAttachment)
        : undefined;
      const thread = await context.researchThreads.get(input);
      if (!thread) throw notFound("Research thread is unavailable");
      const userMessage = await context.researchThreads.append({
        threadId: thread.id,
        role: "user",
        content: input.question,
        ...(selectedText ? { selectedText } : {}),
      });
      if (!userMessage) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Research question could not be persisted",
        });
      }
      const answer = await context.researchTurns.answer(
        {
          threadId: thread.id,
          ...(attachments ? { attachments } : {}),
          history: thread.messages.map(
            ({ role, content, references, selectedText }) => ({
              role,
              content:
                role === "assistant" && references?.length
                  ? researchAnswerHistoryContent(content, references)
                  : content,
              ...(selectedText ? { selectedText } : {}),
            }),
          ),
          model: input.model,
          question: input.question,
          sourceTitle: reading.source.title,
          componentLabel: component.label,
          ...(selectedText ? { selectedText } : {}),
          sourceText: component.plainText,
          components: reading.components.map(
            ({ identity, label, plainText, role }) => ({
              identity,
              label,
              plainText,
              role,
            }),
          ),
        },
        researchAssistantAnswerOptions(context),
      );
      return streamToAsyncIteratorObject(answer);
    }),
};

function threadTitle(question: string) {
  return question.length <= 120 ? question : `${question.slice(0, 117)}...`;
}

function temporaryAttachment(
  attachment: z.infer<typeof temporaryAttachmentInput>,
) {
  const prefix = `data:${attachment.mediaType};base64,`;
  if (!attachment.dataUrl.startsWith(prefix)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Attachment ${attachment.filename} does not match its media type`,
    });
  }
  const encoded = attachment.dataUrl.slice(prefix.length);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const validBase64 =
    encoded.length % 4 === 0 &&
    /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(
      encoded,
    );
  const decodedSize = (encoded.length / 4) * 3 - padding;
  if (!validBase64 || decodedSize !== attachment.size) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Attachment ${attachment.filename} has invalid size metadata`,
    });
  }
  return {
    data: new URL(attachment.dataUrl),
    filename: attachment.filename,
    mediaType: attachment.mediaType,
  };
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
