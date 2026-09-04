import type { db } from "@lirna/db";
import {
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type {
  ResearchThread,
  ResearchThreadMessage,
  ResearchThreadOperations,
  ResearchThreadSummary,
} from "./research-thread-contract";

export class DrizzleResearchThreadStore implements ResearchThreadOperations {
  constructor(private readonly database: typeof db) {}

  async create(
    input: Parameters<ResearchThreadOperations["create"]>[0],
  ): Promise<ResearchThread> {
    const [thread] = await this.database
      .insert(researchThreads)
      .values({
        sourceStateId: input.stateId,
        componentIdentity: input.componentIdentity,
        componentLabel: input.componentLabel,
        title: input.title,
      })
      .returning();
    if (!thread) throw new Error("Research thread was not created");
    return { ...serializeThread(thread, input.sourceId), messages: [] };
  }

  async list(
    input: Parameters<ResearchThreadOperations["list"]>[0],
  ): Promise<ResearchThreadSummary[]> {
    const rows = await this.database
      .select({ thread: researchThreads })
      .from(researchThreads)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, researchThreads.sourceStateId),
      )
      .where(
        and(
          eq(sourceStates.sourceId, input.sourceId),
          eq(sourceStates.id, input.stateId),
        ),
      )
      .orderBy(desc(researchThreads.updatedAt));
    return rows.map(({ thread }) => serializeThread(thread, input.sourceId));
  }

  async projectSelectedPath(
    input: Parameters<ResearchThreadOperations["projectSelectedPath"]>[0],
  ): Promise<ResearchThread | undefined> {
    const [row] = await this.database
      .select({ thread: researchThreads })
      .from(researchThreads)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, researchThreads.sourceStateId),
      )
      .where(
        and(
          eq(researchThreads.id, input.threadId),
          eq(sourceStates.sourceId, input.sourceId),
          eq(sourceStates.id, input.stateId),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    const messages = await this.loadMessages(input.threadId);
    return {
      ...serializeThread(row.thread, input.sourceId),
      messages: selectedPath(messages, row.thread.selectedLeafMessageId).map(
        serializeMessage,
      ),
    };
  }

  async appendQuestion(
    input: Parameters<ResearchThreadOperations["appendQuestion"]>[0],
  ): Promise<ResearchThreadMessage | undefined> {
    const [message] = await this.database.transaction(async (tx) => {
      const [thread] = await tx
        .select({
          selectedLeafMessageId: researchThreads.selectedLeafMessageId,
        })
        .from(researchThreads)
        .where(eq(researchThreads.id, input.threadId))
        .limit(1);
      if (!thread) return [];
      const inserted = await tx
        .insert(researchThreadMessages)
        .values({
          researchThreadId: input.threadId,
          parentMessageId: thread.selectedLeafMessageId,
          role: "user",
          content: input.content,
          selectedText: input.selectedText,
        })
        .returning();
      const question = inserted[0];
      if (question) {
        await tx
          .update(researchThreads)
          .set({ selectedLeafMessageId: question.id, updatedAt: new Date() })
          .where(eq(researchThreads.id, input.threadId));
      }
      return inserted;
    });
    return message ? serializeMessage(message) : undefined;
  }

  async commitAnswer(
    input: Parameters<ResearchThreadOperations["commitAnswer"]>[0],
  ): Promise<ResearchThreadMessage | undefined> {
    const [message] = await this.database.transaction(async (tx) => {
      const inserted = await tx
        .insert(researchThreadMessages)
        .values({
          id: input.answerMessageId,
          researchThreadId: input.threadId,
          parentMessageId: input.questionMessageId,
          role: "assistant",
          content: input.content,
          model: input.model,
          references: input.references,
        })
        .returning();
      const answer = inserted[0];
      if (answer) {
        await tx
          .update(researchThreads)
          .set({ selectedLeafMessageId: answer.id, updatedAt: new Date() })
          .where(eq(researchThreads.id, input.threadId));
      }
      return inserted;
    });
    return message ? serializeMessage(message) : undefined;
  }

  async historyThroughQuestion(
    input: Parameters<ResearchThreadOperations["historyThroughQuestion"]>[0],
  ): Promise<ResearchThreadMessage[] | undefined> {
    const messages = await this.loadMessages(input.threadId);
    const question = messages.find(
      ({ id, role }) => id === input.questionMessageId && role === "user",
    );
    return question
      ? selectedPath(messages, question.id).map(serializeMessage)
      : undefined;
  }

  async listChildren(
    input: Parameters<ResearchThreadOperations["listChildren"]>[0],
  ): Promise<ResearchThreadMessage[]> {
    const parent = input.parentMessageId
      ? eq(researchThreadMessages.parentMessageId, input.parentMessageId)
      : isNull(researchThreadMessages.parentMessageId);
    const messages = await this.database
      .select()
      .from(researchThreadMessages)
      .where(
        and(
          eq(researchThreadMessages.researchThreadId, input.threadId),
          parent,
        ),
      )
      .orderBy(asc(researchThreadMessages.sequence));
    return messages.map(serializeMessage);
  }

  private loadMessages(threadId: string) {
    return this.database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, threadId))
      .orderBy(asc(researchThreadMessages.sequence));
  }
}

function serializeThread(
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

function serializeMessage(
  message: typeof researchThreadMessages.$inferSelect,
): ResearchThreadMessage {
  return {
    id: message.id,
    ...(message.parentMessageId
      ? { parentMessageId: message.parentMessageId }
      : {}),
    role: message.role as ResearchThreadMessage["role"],
    content: message.content,
    ...(message.model
      ? { model: message.model as ResearchThreadMessage["model"] }
      : {}),
    ...(message.selectedText ? { selectedText: message.selectedText } : {}),
    ...(message.references?.length ? { references: message.references } : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

function selectedPath(
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
