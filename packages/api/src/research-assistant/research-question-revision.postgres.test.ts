import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { researchThreadMessages } from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq } from "drizzle-orm";

import { DrizzleResearchThreadStore } from "./research-thread-store";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_question_revision_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: DrizzleResearchThreadStore;

describePostgres("Research question revision PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    store = new DrizzleResearchThreadStore(database);
    await database.insert(sources).values({
      id: sourceId,
      title: "Test entry",
      stableKey: `research-question-revision:${sourceId}`,
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

  afterAll(async () => cleanupDatabase?.());

  test("preserves the original path and durably selects a metadata-preserving revision", async () => {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Question alternatives",
    });
    const original = await store.appendQuestion({
      threadId: thread.id,
      expectedSelectedLeafMessageId: null,
      content: "Original question",
      selectedText: "Selected evidence",
      temporaryEvidence: [
        { filename: "evidence.txt", mediaType: "text/plain" },
      ],
    });
    if (!original) throw new Error("Original question was not created");
    const originalAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: original.id,
      content: "Original answer",
      model: "z-ai/glm-5.3-flash",
    });
    if (!originalAnswer) throw new Error("Original answer was not created");
    const followUp = await store.appendQuestion({
      threadId: thread.id,
      expectedSelectedLeafMessageId: originalAnswer.id,
      content: "Original follow-up",
    });
    if (!followUp) throw new Error("Follow-up was not created");
    const followUpAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: thread.id,
      questionMessageId: followUp.id,
      expectedSelectedLeafMessageId: followUp.id,
      content: "Original downstream answer",
      model: "z-ai/glm-5.3-flash",
    });
    if (!followUpAnswer) throw new Error("Follow-up answer was not created");

    const revised = await store.reviseQuestion({
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: followUpAnswer.id,
      content: "Revised question",
    });
    expect(revised).toMatchObject({
      originMessageId: original.id,
      role: "user",
      content: "Revised question",
      selectedText: "Selected evidence",
      temporaryEvidence: [
        { filename: "evidence.txt", mediaType: "text/plain" },
      ],
    });
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: thread.id }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: revised?.id,
          questionAlternatives: {
            position: 2,
            total: 2,
            previousQuestionId: original.id,
          },
        },
      ],
    });
    const allMessages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, thread.id));
    expect(allMessages).toHaveLength(5);
    expect(allMessages.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        original.id,
        originalAnswer.id,
        followUp.id,
        followUpAnswer.id,
        revised?.id,
      ]),
    );

    expect(
      await store.selectQuestionAlternative({
        threadId: thread.id,
        questionMessageId: original.id,
        expectedSelectedLeafMessageId: revised?.id ?? "missing",
      }),
    ).toBe(true);
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: thread.id }),
    ).resolves.toMatchObject({
      messages: [
        { id: original.id },
        { id: originalAnswer.id },
        { id: followUp.id },
        { id: followUpAnswer.id },
      ],
    });
    expect(
      await store.selectQuestionAlternative({
        threadId: thread.id,
        questionMessageId: revised?.id ?? "missing",
        expectedSelectedLeafMessageId: followUpAnswer.id,
      }),
    ).toBe(true);
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: thread.id }),
    ).resolves.toMatchObject({ messages: [{ id: revised?.id }] });
  });

  test("allows only one concurrent revision without retaining a partial branch", async () => {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Concurrent revision",
    });
    const original = await store.appendQuestion({
      threadId: thread.id,
      expectedSelectedLeafMessageId: null,
      content: "Original concurrent question",
    });
    if (!original) throw new Error("Original question was not created");
    const revisions = await Promise.all([
      store.reviseQuestion({
        threadId: thread.id,
        questionMessageId: original.id,
        expectedSelectedLeafMessageId: original.id,
        content: "First revision",
      }),
      store.reviseQuestion({
        threadId: thread.id,
        questionMessageId: original.id,
        expectedSelectedLeafMessageId: original.id,
        content: "Second revision",
      }),
    ]);
    expect(revisions.filter(Boolean)).toHaveLength(1);
    const messages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, thread.id));
    expect(messages).toHaveLength(2);
    expect(
      messages.filter(({ originMessageId }) => originMessageId === original.id),
    ).toHaveLength(1);
  });
});
