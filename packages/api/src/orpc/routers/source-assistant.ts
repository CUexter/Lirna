import { openapi } from "@orpc/openapi";
import { ORPCError, streamToAsyncIteratorObject } from "@orpc/server";
import { z } from "zod";
import {
  authoredTargetInputSchema,
  InvalidAuthoredTargetError,
  validateAuthoredTarget,
} from "../../authored-targets/authored-target";
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

export const sourceAssistantRouter = {
  ask: publicProcedure
    .input(
      sourceStateInput.extend({
        attachments: z.array(temporaryAttachmentInput).max(3).optional(),
        componentIdentity: z.string().trim().min(1).max(2_000),
        question: z.string().trim().min(1).max(4_000),
        selection: authoredTargetInputSchema.optional(),
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
      return streamToAsyncIteratorObject(
        context.researchAssistant.answer({
          ...(input.attachments?.length
            ? { attachments: input.attachments.map(temporaryAttachment) }
            : {}),
          question: input.question,
          sourceTitle: reading.source.title,
          componentLabel: component.label,
          ...(selectedText ? { selectedText } : {}),
          sourceText: component.plainText,
        }),
      );
    }),
};

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
