import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { temporaryEvidenceMediaTypes } from "../../research-assistant/research-thread-contract";

export const temporaryAttachmentInput = z.object({
  dataUrl: z.string().max(7_000_000),
  filename: z.string().trim().min(1).max(255),
  mediaType: z.enum(temporaryEvidenceMediaTypes),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(5 * 1024 * 1024),
});

export const temporaryEvidenceDescriptorSchema = z.object({
  filename: z.string(),
  mediaType: z.enum(temporaryEvidenceMediaTypes),
});

export function temporaryAttachment(
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

export function requireTemporaryEvidence(
  required: Array<{ filename: string; mediaType: string }>,
  supplied: Array<z.infer<typeof temporaryAttachmentInput>>,
) {
  const orderedRequired = [...required].sort(compareTemporaryEvidence);
  const orderedSupplied = [...supplied].sort(compareTemporaryEvidence);
  const matches =
    orderedRequired.length === orderedSupplied.length &&
    orderedRequired.every((descriptor, index) => {
      const attachment = orderedSupplied[index];
      return (
        attachment?.filename === descriptor.filename &&
        attachment.mediaType === descriptor.mediaType
      );
    });
  if (matches) return;
  const description = required
    .map(({ filename, mediaType }) => `${filename} (${mediaType})`)
    .join(", ");
  throw new ORPCError("BAD_REQUEST", {
    message: description
      ? `Reattach temporary evidence before retrying: ${description}`
      : "This question did not use temporary evidence",
  });
}

function compareTemporaryEvidence(
  left: { filename: string; mediaType: string },
  right: { filename: string; mediaType: string },
) {
  return (
    left.filename.localeCompare(right.filename) ||
    left.mediaType.localeCompare(right.mediaType)
  );
}
