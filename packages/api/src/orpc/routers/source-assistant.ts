import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import type { UIMessageChunk } from "ai";
import { z } from "zod";
import {
  authoredTargetInputSchema,
  InvalidAuthoredTargetError,
  validateAuthoredTarget,
} from "../../authored-targets/authored-target";
import { persistAssistantAnswer } from "../../research-assistant/assistant-stream-persistence";
import { researchAnswerHistoryContent } from "../../research-assistant/research-answer-markers";
import { publicProcedure } from "../init";
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
      if (!context.researchAssistant) {
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
      const handleStreamError = streamErrorHandler(context);
      const answer = await context.researchAssistant.answer(
        {
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
        { onError: handleStreamError },
      );
      const [responseStream, persistenceStream] = answer.tee();
      const persistence = persistAssistantAnswer(
        persistenceStream,
        (content, references) =>
          context.researchThreads.append({
            threadId: thread.id,
            role: "assistant",
            content,
            ...(references.length ? { references } : {}),
          }),
      ).catch(handleStreamError);
      return streamToAsyncIteratorObject(
        recoverAssistantStream(responseStream, handleStreamError, persistence),
      );
    }),
};

function threadTitle(question: string) {
  return question.length <= 120 ? question : `${question.slice(0, 117)}...`;
}

function recoverAssistantStream(
  stream: ReadableStream<UIMessageChunk>,
  onError: (error: unknown) => string,
  completion?: Promise<unknown>,
): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          await completion;
          if (!cancelled) controller.close();
          return;
        }
        if (cancelled) return;
        controller.enqueue(next.value);
      } catch (error) {
        if (cancelled) return;
        controller.enqueue({ type: "error", errorText: onError(error) });
        controller.close();
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason);
    },
  });
}

function streamErrorHandler(context: {
  debugErrors?: boolean;
  observation?: {
    requestId: string;
    emit(level: "error", record: Record<string, unknown>): void;
  };
}) {
  let observed = false;
  return (error: unknown) => {
    const cause = error instanceof Error ? error : new Error(String(error));
    if (!observed) {
      observed = true;
      try {
        context.observation?.emit("error", {
          event: "research_assistant.stream_failed",
          operation: "sources.assistant.ask",
          outcome: "failure",
          err: cause,
        });
      } catch {
        // Diagnostics must not alter stream handling.
      }
    }
    const reference = context.observation?.requestId;
    const detail = context.debugErrors ? `: ${cause.message}` : ".";
    return `Research assistant response failed${detail}${
      reference ? ` Error reference: ${reference}.` : ""
    }`;
  };
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
