import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  researchEvidenceReceipts,
  researchThreadForks,
  researchThreadMessages,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq, sql } from "drizzle-orm";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_thread_forks_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = "10000000-0000-4000-8000-000000000010";
const stateId = "20000000-0000-4000-8000-000000000010";

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./research-thread-store")["DrizzleResearchThreadStore"]
>;

describePostgres("related Research thread PostgreSQL store", () => {
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
      title: "Fork test Source",
      stableKey: `research-thread-fork:${sourceId}`,
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

  test("copies only the selected prefix with fresh identities and durable provenance", async () => {
    const source = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Original inquiry",
    });
    const firstQuestion = await store.appendQuestion({
      threadId: source.id,
      expectedSelectedLeafMessageId: null,
      content: "First question",
    });
    if (!firstQuestion) throw new Error("First question was not persisted");
    const selectedAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: source.id,
      questionMessageId: firstQuestion.id,
      expectedSelectedLeafMessageId: firstQuestion.id,
      content: "Selected answer",
      model: "z-ai/glm-5.3-flash",
      references: [reference()],
    });
    if (!selectedAnswer) throw new Error("Selected answer was not persisted");
    const descendant = await store.appendQuestion({
      threadId: source.id,
      expectedSelectedLeafMessageId: selectedAnswer.id,
      content: "A descendant that must not be copied",
    });
    if (!descendant) throw new Error("Descendant was not persisted");
    const unselectedAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: source.id,
      questionMessageId: firstQuestion.id,
      expectedSelectedLeafMessageId: descendant.id,
      content: "Unselected alternative",
      model: "z-ai/glm-5.3-flash",
      regeneratedFromAnswerId: selectedAnswer.id,
    });
    if (!unselectedAnswer) throw new Error("Alternative was not persisted");
    await database.insert(researchEvidenceReceipts).values(receipt(source.id));
    const sourceBefore = await store.projectSelectedPath({
      sourceId,
      stateId,
      threadId: source.id,
    });
    const sourceMessagesBefore = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, source.id));

    const result = await store.createRelatedThread({
      creationId: randomUUID(),
      sourceId,
      stateId,
      sourceThreadId: source.id,
      sourceAnswerMessageId: selectedAnswer.id,
      title: "Related inquiry",
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("Fork was not created");
    expect(result.thread).toMatchObject({
      sourceId,
      stateId,
      componentIdentity: source.componentIdentity,
      componentLabel: source.componentLabel,
      title: "Related inquiry",
      messages: [
        { content: "First question", originMessageId: firstQuestion.id },
        {
          content: "Selected answer",
          originMessageId: selectedAnswer.id,
          references: [reference()],
        },
      ],
    });
    expect(result.thread.messages[0]?.id).not.toBe(firstQuestion.id);
    expect(result.thread.messages[1]?.id).not.toBe(selectedAnswer.id);
    expect(result.thread.messages[1]?.parentMessageId).toBe(
      result.thread.messages[0]?.id,
    );
    expect(result.thread.messages.map(({ content }) => content)).not.toContain(
      "A descendant that must not be copied",
    );
    expect(result.thread.messages.map(({ content }) => content)).not.toContain(
      "Unselected alternative",
    );
    await expect(
      store.lineage({ sourceId, stateId, threadId: source.id }),
    ).resolves.toEqual({
      relatedThreads: [
        {
          answerMessageId: selectedAnswer.id,
          answerPreview: "Selected answer",
          threadId: result.thread.id,
          title: "Related inquiry",
        },
      ],
    });
    await expect(
      store.lineage({ sourceId, stateId, threadId: result.thread.id }),
    ).resolves.toEqual({
      source: {
        answerMessageId: selectedAnswer.id,
        answerPreview: "Selected answer",
        threadId: source.id,
        title: "Original inquiry",
      },
      relatedThreads: [],
    });
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: source.id }),
    ).resolves.toEqual(sourceBefore);
    expect(
      await database
        .select()
        .from(researchThreadMessages)
        .where(eq(researchThreadMessages.researchThreadId, source.id)),
    ).toEqual(sourceMessagesBefore);
    const forkRows = await database
      .select()
      .from(researchThreadForks)
      .where(eq(researchThreadForks.newThreadId, result.thread.id));
    expect(forkRows).toMatchObject([
      {
        sourceThreadId: source.id,
        sourceAnswerMessageId: selectedAnswer.id,
        newThreadId: result.thread.id,
      },
    ]);
    const copiedReceipts = await database
      .select()
      .from(researchEvidenceReceipts)
      .where(eq(researchEvidenceReceipts.researchThreadId, result.thread.id));
    expect(copiedReceipts).toEqual([]);
    const relatedQuestion = await store.appendQuestion({
      threadId: result.thread.id,
      expectedSelectedLeafMessageId: result.thread.messages.at(-1)?.id ?? null,
      content: "Independent follow-up",
    });
    if (!relatedQuestion) throw new Error("Related question was not persisted");
    const relatedAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: result.thread.id,
      questionMessageId: relatedQuestion.id,
      expectedSelectedLeafMessageId: relatedQuestion.id,
      content: "Independent answer",
      model: "z-ai/glm-5.3-flash",
      references: [reference()],
    });
    if (!relatedAnswer) throw new Error("Related answer was not persisted");
    await database.insert(researchEvidenceReceipts).values({
      ...receipt(result.thread.id),
      questionMessageId: relatedQuestion.id,
      attemptedAnswerMessageId: relatedAnswer.id,
    });
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: source.id }),
    ).resolves.toEqual(sourceBefore);
    const sourceReceipts = await database
      .select()
      .from(researchEvidenceReceipts)
      .where(eq(researchEvidenceReceipts.researchThreadId, source.id));
    const relatedReceipts = await database
      .select()
      .from(researchEvidenceReceipts)
      .where(eq(researchEvidenceReceipts.researchThreadId, result.thread.id));
    expect(sourceReceipts).toHaveLength(1);
    expect(relatedReceipts).toMatchObject([
      {
        questionMessageId: relatedQuestion.id,
        attemptedAnswerMessageId: relatedAnswer.id,
      },
    ]);
    const copiedMessages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, result.thread.id));
    expect(copiedMessages).toHaveLength(4);
  });

  test("replays an identical creation ID and conflicts when its input changes", async () => {
    const source = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Idempotency source",
    });
    const question = await store.appendQuestion({
      threadId: source.id,
      expectedSelectedLeafMessageId: null,
      content: "Question",
    });
    if (!question) throw new Error("Question was not persisted");
    const answer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: source.id,
      questionMessageId: question.id,
      expectedSelectedLeafMessageId: question.id,
      content: "Answer",
      model: "z-ai/glm-5.3-flash",
    });
    if (!answer) throw new Error("Answer was not persisted");
    const creationId = randomUUID();
    const input = {
      creationId,
      sourceId,
      stateId,
      sourceThreadId: source.id,
      sourceAnswerMessageId: answer.id,
      title: "Stable related inquiry",
    };

    const created = await store.createRelatedThread(input);
    const replayed = await store.createRelatedThread(input);
    const conflict = await store.createRelatedThread({
      ...input,
      title: "Different inquiry",
    });

    expect(created.status).toBe("created");
    expect(replayed).toMatchObject({
      status: "existing",
      thread: { id: created.status === "created" ? created.thread.id : "" },
    });
    expect(conflict).toEqual({ status: "conflict" });
  });

  test("rolls back the thread and provenance record when copying fails", async () => {
    const source = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Rollback source",
    });
    const question = await store.appendQuestion({
      threadId: source.id,
      expectedSelectedLeafMessageId: null,
      content: "Question that cannot be copied",
    });
    if (!question) throw new Error("Question was not persisted");
    const answer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: source.id,
      questionMessageId: question.id,
      expectedSelectedLeafMessageId: question.id,
      content: "Answer that cannot be copied",
      model: "z-ai/glm-5.3-flash",
    });
    if (!answer) throw new Error("Answer was not persisted");
    const creationId = randomUUID();

    await database.execute(
      sql.raw(`
      CREATE FUNCTION reject_research_thread_copy() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced copy failure'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_research_thread_copy
      BEFORE INSERT ON research_thread_messages
      FOR EACH ROW WHEN (NEW.origin_message_id IS NOT NULL)
      EXECUTE FUNCTION reject_research_thread_copy();
    `),
    );
    try {
      await expect(
        store.createRelatedThread({
          creationId,
          sourceId,
          stateId,
          sourceThreadId: source.id,
          sourceAnswerMessageId: answer.id,
          title: "Rolled-back inquiry",
        }),
      ).rejects.toThrow();
    } finally {
      await database.execute(
        sql.raw(`
        DROP TRIGGER reject_research_thread_copy ON research_thread_messages;
        DROP FUNCTION reject_research_thread_copy();
      `),
      );
    }

    expect(
      await database
        .select()
        .from(researchThreadForks)
        .where(eq(researchThreadForks.creationId, creationId)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(researchThreads)
        .where(eq(researchThreads.title, "Rolled-back inquiry")),
    ).toEqual([]);
  });
});

function reference() {
  return {
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    selection: {
      offsetBasis: "normalized-derivative-text-v1" as const,
      normalizedStartOffset: 0,
      normalizedEndOffset: 8,
      exactText: "Evidence",
      prefix: "",
      suffix: "",
    },
  };
}

function receipt(researchThreadId: string) {
  return {
    sessionId: randomUUID(),
    researchThreadId,
    sourceStateId: stateId,
    resolverVersion: "test",
    indexVersion: "test",
    outcome: "successful",
    latencyBucket: "under-100ms",
  };
}
