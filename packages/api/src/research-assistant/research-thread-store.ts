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
import { createRelatedResearchThread } from "./research-thread-fork-store";
import {
  selectedPath,
  serializeMessage,
  serializeThread,
} from "./research-thread-projection";

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
        (message) => serializeMessage(message, messages),
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
      if (thread.selectedLeafMessageId !== input.expectedSelectedLeafMessageId)
        return [];
      const inserted = await tx
        .insert(researchThreadMessages)
        .values({
          researchThreadId: input.threadId,
          parentMessageId: thread.selectedLeafMessageId,
          role: "user",
          content: input.content,
          selectedText: input.selectedText,
          temporaryEvidence: input.temporaryEvidence,
        })
        .returning();
      const question = inserted[0];
      if (question) {
        const selected = await tx
          .update(researchThreads)
          .set({ selectedLeafMessageId: question.id, updatedAt: new Date() })
          .where(
            and(
              eq(researchThreads.id, input.threadId),
              input.expectedSelectedLeafMessageId
                ? eq(
                    researchThreads.selectedLeafMessageId,
                    input.expectedSelectedLeafMessageId,
                  )
                : isNull(researchThreads.selectedLeafMessageId),
            ),
          )
          .returning({ id: researchThreads.id });
        if (selected.length === 0) {
          await tx
            .delete(researchThreadMessages)
            .where(eq(researchThreadMessages.id, question.id));
          return [];
        }
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
          regeneratedFromAnswerId: input.regeneratedFromAnswerId,
          references: input.references,
        })
        .returning();
      const answer = inserted[0];
      if (answer) {
        await tx
          .update(researchThreads)
          .set({ selectedLeafMessageId: answer.id, updatedAt: new Date() })
          .where(
            and(
              eq(researchThreads.id, input.threadId),
              eq(
                researchThreads.selectedLeafMessageId,
                input.expectedSelectedLeafMessageId,
              ),
            ),
          );
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
      ? selectedPath(messages, question.id).map((message) =>
          serializeMessage(message),
        )
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
    return messages.map((message) => serializeMessage(message));
  }

  async selectAnswerAlternative(
    input: Parameters<ResearchThreadOperations["selectAnswerAlternative"]>[0],
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [thread] = await tx
        .select({
          selectedLeafMessageId: researchThreads.selectedLeafMessageId,
        })
        .from(researchThreads)
        .where(eq(researchThreads.id, input.threadId))
        .for("update")
        .limit(1);
      if (
        !thread ||
        thread.selectedLeafMessageId !== input.expectedSelectedLeafMessageId
      )
        return false;
      const messages = await tx
        .select()
        .from(researchThreadMessages)
        .where(eq(researchThreadMessages.researchThreadId, input.threadId))
        .orderBy(asc(researchThreadMessages.sequence));
      const answer = messages.find(
        ({ id, role }) => id === input.answerMessageId && role === "assistant",
      );
      if (!answer) return false;
      await tx
        .update(researchThreads)
        .set({
          selectedLeafMessageId: latestDescendant(messages, answer.id),
          updatedAt: new Date(),
        })
        .where(eq(researchThreads.id, input.threadId));
      return true;
    });
  }

  async createRelatedThread(
    input: Parameters<ResearchThreadOperations["createRelatedThread"]>[0],
  ): ReturnType<ResearchThreadOperations["createRelatedThread"]> {
    return createRelatedResearchThread(this.database, input);
  }

  private loadMessages(threadId: string) {
    return this.database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, threadId))
      .orderBy(asc(researchThreadMessages.sequence));
  }
}

function latestDescendant(
  messages: Array<typeof researchThreadMessages.$inferSelect>,
  answerId: string,
) {
  const descendants = new Set([answerId]);
  let leafId = answerId;
  for (const message of messages) {
    if (message.parentMessageId && descendants.has(message.parentMessageId)) {
      descendants.add(message.id);
      leafId = message.id;
    }
  }
  return leafId;
}
