import type { db } from "@lirna/db";
import {
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";

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

  async get(
    input: Parameters<ResearchThreadOperations["get"]>[0],
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
    const messages = await this.database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, input.threadId))
      .orderBy(asc(researchThreadMessages.sequence));
    return {
      ...serializeThread(row.thread, input.sourceId),
      messages: messages.map(serializeMessage),
    };
  }

  async append(
    input: Parameters<ResearchThreadOperations["append"]>[0],
  ): Promise<ResearchThreadMessage | undefined> {
    const [message] = await this.database.transaction(async (tx) => {
      const inserted = await tx
        .insert(researchThreadMessages)
        .values({
          researchThreadId: input.threadId,
          role: input.role,
          content: input.content,
          selectedText: input.selectedText,
          references: input.references,
        })
        .returning();
      if (inserted.length) {
        await tx
          .update(researchThreads)
          .set({ updatedAt: new Date() })
          .where(eq(researchThreads.id, input.threadId));
      }
      return inserted;
    });
    return message ? serializeMessage(message) : undefined;
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
    role: message.role as ResearchThreadMessage["role"],
    content: message.content,
    ...(message.selectedText ? { selectedText: message.selectedText } : {}),
    ...(message.references?.length ? { references: message.references } : {}),
    createdAt: message.createdAt.toISOString(),
  };
}
