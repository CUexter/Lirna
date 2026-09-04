import type {
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { z } from "zod";

import { authoredTargetInputSchema } from "../authored-targets/authored-target";
import type {
  ResearchThreadMessage,
  ResearchThreadSummary,
} from "./research-thread-contract";
import { temporaryEvidenceMediaTypes } from "./research-thread-contract";

const temporaryEvidenceSchema = z.array(
  z.object({
    filename: z.string(),
    mediaType: z.enum(temporaryEvidenceMediaTypes),
  }),
);
const researchPassageReferencesSchema = z.array(
  z.object({
    id: z.string().uuid().optional(),
    componentIdentity: z.string(),
    componentLabel: z.string(),
    occurrences: z
      .array(
        z.object({
          answerTarget: z.object({
            startOffset: z.number().int().nonnegative(),
            endOffset: z.number().int().positive(),
          }),
          id: z.string().uuid(),
          presentation: z.enum(["passing", "quote"]),
          relation: z.enum([
            "supports",
            "qualifies",
            "conflicts",
            "background",
          ]),
          referenceId: z.string().uuid(),
        }),
      )
      .optional(),
    selection: authoredTargetInputSchema,
  }),
);

export function serializeThread(
  thread: typeof researchThreads.$inferSelect,
  sourceId: string,
): ResearchThreadSummary {
  return {
    id: thread.id,
    sourceId,
    stateId: thread.sourceStateId,
    componentIdentity: thread.componentIdentity,
    componentLabel: thread.componentLabel,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

export function serializeMessage(
  message: typeof researchThreadMessages.$inferSelect,
  messages?: Array<typeof researchThreadMessages.$inferSelect>,
): ResearchThreadMessage {
  return {
    id: message.id,
    ...(message.originMessageId
      ? { originMessageId: message.originMessageId }
      : {}),
    ...(message.parentMessageId
      ? { parentMessageId: message.parentMessageId }
      : {}),
    role: message.role as ResearchThreadMessage["role"],
    content: message.content,
    ...(message.model
      ? { model: message.model as ResearchThreadMessage["model"] }
      : {}),
    ...(message.regeneratedFromAnswerId
      ? { regeneratedFromAnswerId: message.regeneratedFromAnswerId }
      : {}),
    ...(message.role === "assistant" && messages
      ? { answerAlternatives: answerAlternatives(message, messages) }
      : {}),
    ...(message.selectedText ? { selectedText: message.selectedText } : {}),
    ...(message.temporaryEvidence?.length
      ? {
          temporaryEvidence: temporaryEvidenceSchema.parse(
            message.temporaryEvidence,
          ),
        }
      : {}),
    ...(message.references?.length
      ? {
          references: researchPassageReferencesSchema.parse(message.references),
        }
      : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

function answerAlternatives(
  answer: typeof researchThreadMessages.$inferSelect,
  messages: Array<typeof researchThreadMessages.$inferSelect>,
) {
  const siblings = messages.filter(
    ({ parentMessageId, role }) =>
      role === "assistant" && parentMessageId === answer.parentMessageId,
  );
  const index = siblings.findIndex(({ id }) => id === answer.id);
  return {
    position: index + 1,
    total: siblings.length,
    ...(index > 0 ? { previousAnswerId: siblings[index - 1]?.id } : {}),
    ...(index < siblings.length - 1
      ? { nextAnswerId: siblings[index + 1]?.id }
      : {}),
  };
}

export function selectedPath(
  messages: Array<typeof researchThreadMessages.$inferSelect>,
  leafId: string | null,
) {
  if (!leafId) return [];
  const byId = new Map(messages.map((message) => [message.id, message]));
  const path: Array<typeof researchThreadMessages.$inferSelect> = [];
  let current = byId.get(leafId);
  while (current) {
    path.push(current);
    current = current.parentMessageId
      ? byId.get(current.parentMessageId)
      : undefined;
  }
  return path.reverse();
}
