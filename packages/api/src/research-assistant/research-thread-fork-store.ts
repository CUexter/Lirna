import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import {
  researchThreadForks,
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

import type { ResearchThreadOperations } from "./research-thread-contract";
import {
  selectedPath,
  serializeMessage,
  serializeThread,
} from "./research-thread-projection";

type CreateRelatedInput = Parameters<
  ResearchThreadOperations["createRelatedThread"]
>[0];

export function createRelatedResearchThread(
  database: typeof db,
  input: CreateRelatedInput,
): ReturnType<ResearchThreadOperations["createRelatedThread"]> {
  return database.transaction(async (tx) => {
    const replay = async () => {
      const [existing] = await tx
        .select({ fork: researchThreadForks, thread: researchThreads })
        .from(researchThreadForks)
        .innerJoin(
          researchThreads,
          eq(researchThreads.id, researchThreadForks.newThreadId),
        )
        .where(eq(researchThreadForks.creationId, input.creationId))
        .limit(1);
      if (!existing) return undefined;
      const identical =
        existing.fork.sourceThreadId === input.sourceThreadId &&
        existing.fork.sourceAnswerMessageId === input.sourceAnswerMessageId &&
        existing.thread.sourceStateId === input.stateId &&
        existing.thread.title === input.title;
      if (!identical) return { status: "conflict" as const };
      const [state] = await tx
        .select({ sourceId: sourceStates.sourceId })
        .from(sourceStates)
        .where(eq(sourceStates.id, existing.thread.sourceStateId))
        .limit(1);
      if (state?.sourceId !== input.sourceId)
        return { status: "conflict" as const };
      const messages = await tx
        .select()
        .from(researchThreadMessages)
        .where(eq(researchThreadMessages.researchThreadId, existing.thread.id))
        .orderBy(asc(researchThreadMessages.sequence));
      return {
        status: "existing" as const,
        thread: {
          ...serializeThread(existing.thread, input.sourceId),
          messages: selectedPath(
            messages,
            existing.thread.selectedLeafMessageId,
          ).map((message) => serializeMessage(message, messages)),
        },
      };
    };

    const existing = await replay();
    if (existing) return existing;
    const [source] = await tx
      .select({ thread: researchThreads })
      .from(researchThreads)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, researchThreads.sourceStateId),
      )
      .where(
        and(
          eq(researchThreads.id, input.sourceThreadId),
          eq(sourceStates.sourceId, input.sourceId),
          eq(sourceStates.id, input.stateId),
        ),
      )
      .limit(1);
    if (!source) return { status: "source-answer-not-found" };
    const sourceMessages = await tx
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, input.sourceThreadId))
      .orderBy(asc(researchThreadMessages.sequence));
    const sourceAnswer = sourceMessages.find(
      ({ id, role }) =>
        id === input.sourceAnswerMessageId && role === "assistant",
    );
    if (!sourceAnswer) return { status: "source-answer-not-found" };
    const prefix = selectedPath(sourceMessages, sourceAnswer.id);
    if (prefix.at(-1)?.id !== sourceAnswer.id)
      return { status: "source-answer-not-found" };

    const newThreadId = randomUUID();
    const [newThread] = await tx
      .insert(researchThreads)
      .values({
        id: newThreadId,
        sourceStateId: source.thread.sourceStateId,
        componentIdentity: source.thread.componentIdentity,
        componentLabel: source.thread.componentLabel,
        title: input.title,
      })
      .returning();
    if (!newThread) throw new Error("Related Research thread was not created");
    const [fork] = await tx
      .insert(researchThreadForks)
      .values({
        creationId: input.creationId,
        sourceThreadId: input.sourceThreadId,
        sourceAnswerMessageId: sourceAnswer.id,
        newThreadId,
      })
      .onConflictDoNothing({ target: researchThreadForks.creationId })
      .returning();
    if (!fork) {
      await tx
        .delete(researchThreads)
        .where(eq(researchThreads.id, newThreadId));
      return (await replay()) ?? { status: "conflict" };
    }

    const copiedMessages: Array<typeof researchThreadMessages.$inferSelect> =
      [];
    const copiedIds = new Map<string, string>();
    for (const message of prefix) {
      const id = randomUUID();
      const validated = serializeMessage(message);
      const [copied] = await tx
        .insert(researchThreadMessages)
        .values({
          id,
          researchThreadId: newThreadId,
          parentMessageId: message.parentMessageId
            ? copiedIds.get(message.parentMessageId)
            : undefined,
          role: message.role,
          content: message.content,
          selectedText: message.selectedText,
          temporaryEvidence: validated.temporaryEvidence,
          model: message.model,
          originMessageId: message.id,
          references: validated.references,
        })
        .returning();
      if (!copied) throw new Error("Related Research message was not copied");
      copiedIds.set(message.id, id);
      copiedMessages.push(copied);
    }
    const selectedLeafMessageId = copiedIds.get(sourceAnswer.id);
    if (!selectedLeafMessageId)
      throw new Error("Related Research selected answer was not copied");
    const [selectedThread] = await tx
      .update(researchThreads)
      .set({ selectedLeafMessageId })
      .where(eq(researchThreads.id, newThreadId))
      .returning();
    if (!selectedThread)
      throw new Error("Related Research thread was not selected");
    return {
      status: "created",
      thread: {
        ...serializeThread(selectedThread, input.sourceId),
        messages: copiedMessages.map((message) =>
          serializeMessage(message, copiedMessages),
        ),
      },
    };
  });
}
