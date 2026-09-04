import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq } from "drizzle-orm";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_threads_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./research-thread-store")["DrizzleResearchThreadStore"]
>;

describePostgres("Research thread PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    const { DrizzleResearchThreadStore } = await import(
      "./research-thread-store"
    );
    store = new DrizzleResearchThreadStore(database);
    await database.insert(sources).values({
      id: sourceId,
      title: "Test entry",
      stableKey: `research-thread:${sourceId}`,
    });
    await database.insert(sourceStates).values({
      id: stateId,
      sourceId,
      sequence: 0,
      adapterId: "test",
      rightsBasis: "owned",
      sensitivityLevel: "ordinary-cloud",
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("persists and projects the selected parent-linked path", async () => {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "What is the central claim?",
    });
    const question = await store.appendQuestion({
      threadId: thread.id,
      content: "What is the central claim?",
      selectedText: "Selected evidence",
    });
    if (!question) throw new Error("Question was not persisted");
    const answer = await store.commitAnswer({
      threadId: thread.id,
      questionMessageId: question.id,
      content: "A provisional answer.",
      references: [
        {
          componentIdentity: "active:/",
          componentLabel: "Main entry",
          selection: {
            offsetBasis: "normalized-derivative-text-v1",
            normalizedStartOffset: 0,
            normalizedEndOffset: 17,
            exactText: "Selected evidence",
            prefix: "",
            suffix: "",
          },
        },
      ],
    });
    if (!answer) throw new Error("Answer was not persisted");

    await expect(store.list({ sourceId, stateId })).resolves.toMatchObject([
      { id: thread.id },
    ]);
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: thread.id,
      }),
    ).resolves.toMatchObject({
      id: thread.id,
      messages: [
        {
          role: "user",
          content: "What is the central claim?",
          selectedText: "Selected evidence",
        },
        {
          role: "assistant",
          parentMessageId: question.id,
          content: "A provisional answer.",
          references: [
            {
              componentIdentity: "active:/",
              selection: { exactText: "Selected evidence" },
            },
          ],
        },
      ],
    });
    await expect(
      store.historyThroughQuestion({
        threadId: thread.id,
        questionMessageId: question.id,
      }),
    ).resolves.toMatchObject([{ id: question.id }]);
    await expect(
      store.listChildren({
        threadId: thread.id,
        parentMessageId: question.id,
      }),
    ).resolves.toMatchObject([{ id: answer.id }]);
    await database
      .delete(researchThreads)
      .where(eq(researchThreads.id, thread.id));
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: thread.id,
      }),
    ).resolves.toBeUndefined();
  });

  test("orders sibling answers and rejects malformed graph relationships", async () => {
    const first = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "First inquiry",
    });
    const second = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Second inquiry",
    });
    const firstQuestion = await store.appendQuestion({
      threadId: first.id,
      content: "First question",
    });
    const secondQuestion = await store.appendQuestion({
      threadId: second.id,
      content: "Second question",
    });
    if (!firstQuestion || !secondQuestion)
      throw new Error("Questions were not persisted");
    const firstAnswer = await store.commitAnswer({
      threadId: first.id,
      questionMessageId: firstQuestion.id,
      content: "First answer",
    });
    const alternative = await store.commitAnswer({
      threadId: first.id,
      questionMessageId: firstQuestion.id,
      content: "Alternative answer",
    });
    if (!firstAnswer || !alternative)
      throw new Error("Answers were not persisted");

    await expect(
      store.listChildren({
        threadId: first.id,
        parentMessageId: firstQuestion.id,
      }),
    ).resolves.toMatchObject([{ id: firstAnswer.id }, { id: alternative.id }]);
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: first.id,
      }),
    ).resolves.toMatchObject({
      messages: [{ id: firstQuestion.id }, { id: alternative.id }],
    });
    const followUp = await store.appendQuestion({
      threadId: first.id,
      content: "Follow-up question",
    });
    if (!followUp) throw new Error("Follow-up question was not persisted");
    expect(followUp.parentMessageId).toBe(alternative.id);
    const followUpAnswer = await store.commitAnswer({
      threadId: first.id,
      questionMessageId: followUp.id,
      content: "Follow-up answer",
    });
    if (!followUpAnswer) throw new Error("Follow-up answer was not persisted");
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: first.id,
      }),
    ).resolves.toMatchObject({
      messages: [
        { id: firstQuestion.id },
        { id: alternative.id },
        { id: followUp.id },
        { id: followUpAnswer.id },
      ],
    });

    await expect(
      store.commitAnswer({
        threadId: second.id,
        questionMessageId: firstQuestion.id,
        content: "Cross-thread answer",
      }),
    ).rejects.toBeDefined();
    await expect(
      database
        .insert(researchThreadMessages)
        .values({
          researchThreadId: first.id,
          role: "assistant",
          content: "Invalid root answer",
        })
        .execute(),
    ).rejects.toBeDefined();
    await expect(
      database
        .insert(researchThreadMessages)
        .values({
          researchThreadId: first.id,
          parentMessageId: firstQuestion.id,
          role: "user",
          content: "Invalid user child",
        })
        .execute(),
    ).rejects.toBeDefined();
    await expect(
      database
        .update(researchThreads)
        .set({ selectedLeafMessageId: secondQuestion.id })
        .where(eq(researchThreads.id, first.id))
        .execute(),
    ).rejects.toBeDefined();
    await expect(
      database
        .update(researchThreadMessages)
        .set({ researchThreadId: second.id })
        .where(eq(researchThreadMessages.id, firstQuestion.id))
        .execute(),
    ).rejects.toBeDefined();

    await database
      .delete(researchThreads)
      .where(eq(researchThreads.id, first.id));
    await database
      .delete(researchThreads)
      .where(eq(researchThreads.id, second.id));
  });
});
