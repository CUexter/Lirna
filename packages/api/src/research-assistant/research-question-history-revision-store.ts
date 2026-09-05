import type { db } from "@lirna/db";
import {
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { asc, eq } from "drizzle-orm";

import type {
  ResearchThreadMessage,
  ResearchThreadOperations,
} from "./research-thread-contract";
import { selectedPath, serializeMessage } from "./research-thread-projection";

export async function reviseResearchQuestionWithHistory(
  database: typeof db,
  input: Parameters<ResearchThreadOperations["reviseQuestionWithHistory"]>[0],
): Promise<ResearchThreadMessage | undefined> {
  const leaf = await database.transaction(async (tx) => {
    const [thread] = await tx
      .select({ selectedLeafMessageId: researchThreads.selectedLeafMessageId })
      .from(researchThreads)
      .where(eq(researchThreads.id, input.threadId))
      .for("update")
      .limit(1);
    if (
      !thread ||
      thread.selectedLeafMessageId !== input.expectedSelectedLeafMessageId
    )
      return undefined;
    const messages = await tx
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, input.threadId))
      .orderBy(asc(researchThreadMessages.sequence));
    const path = selectedPath(messages, thread.selectedLeafMessageId);
    const questionIndex = path.findIndex(
      ({ id, role }) => id === input.questionMessageId && role === "user",
    );
    const original = path[questionIndex];
    if (!original || original.content === input.content) return undefined;

    let parentMessageId = original.parentMessageId;
    let copiedLeaf: typeof researchThreadMessages.$inferSelect | undefined;
    for (const [index, source] of path.slice(questionIndex).entries()) {
      const [copied] = await tx
        .insert(researchThreadMessages)
        .values({
          researchThreadId: input.threadId,
          parentMessageId,
          originMessageId: source.id,
          role: source.role,
          content: index === 0 ? input.content : source.content,
          selectedText: source.selectedText,
          temporaryEvidence: source.temporaryEvidence,
          model: source.model,
          // A copied answer was not regenerated; its origin retains that lineage.
          regeneratedFromAnswerId: null,
          references: source.references,
        })
        .returning();
      if (!copied) throw new Error("Research message history was not copied");
      parentMessageId = copied.id;
      copiedLeaf = copied;
    }
    if (!copiedLeaf) return undefined;
    await tx
      .update(researchThreads)
      .set({ selectedLeafMessageId: copiedLeaf.id, updatedAt: new Date() })
      .where(eq(researchThreads.id, input.threadId));
    return copiedLeaf;
  });
  return leaf ? serializeMessage(leaf) : undefined;
}
