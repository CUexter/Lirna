import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { researchThreadMessages } from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq, sql } from "drizzle-orm";

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

  test("copies only the selected suffix with copy provenance and remapped parents", async () => {
    const fixture = await historyFixture("Copied history");

    const copiedLeaf = await store.reviseQuestionWithHistory({
      threadId: fixture.thread.id,
      questionMessageId: fixture.original.id,
      expectedSelectedLeafMessageId: fixture.followUpAnswer.id,
      content: "Edited root question",
    });
    expect(copiedLeaf?.originMessageId).toBe(fixture.followUpAnswer.id);
    const copied = await store.projectSelectedPath({
      sourceId,
      stateId,
      threadId: fixture.thread.id,
    });
    expect(copied?.messages).toHaveLength(4);
    const [question, answer, followUp, followUpAnswer] = copied?.messages ?? [];
    expect(question).toMatchObject({
      originMessageId: fixture.original.id,
      content: "Edited root question",
      selectedText: "Selected evidence",
      temporaryEvidence: [{ filename: "root.txt", mediaType: "text/plain" }],
    });
    expect(answer).toMatchObject({
      originMessageId: fixture.answer.id,
      parentMessageId: question?.id,
      content: fixture.answer.content,
      model: fixture.answer.model,
      references: fixture.answer.references,
    });
    expect(answer?.regeneratedFromAnswerId).toBeUndefined();
    expect(fixture.answer).toMatchObject({
      regeneratedFromAnswerId: fixture.regenerationSource.id,
    });
    expect(followUp).toMatchObject({
      originMessageId: fixture.followUp.id,
      parentMessageId: answer?.id,
      content: fixture.followUp.content,
      selectedText: "Follow-up evidence",
      temporaryEvidence: [
        { filename: "follow-up.txt", mediaType: "text/plain" },
      ],
    });
    expect(followUpAnswer).toMatchObject({
      originMessageId: fixture.followUpAnswer.id,
      parentMessageId: followUp?.id,
      content: fixture.followUpAnswer.content,
      model: fixture.followUpAnswer.model,
      references: fixture.followUpAnswer.references,
    });
    expect(followUpAnswer?.regeneratedFromAnswerId).toBeUndefined();
    const allMessages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, fixture.thread.id));
    expect(allMessages).toHaveLength(9);
    expect(
      allMessages.find(
        ({ originMessageId }) => originMessageId === fixture.answer.id,
      )?.regeneratedFromAnswerId,
    ).toBeNull();
    expect(
      allMessages.find(
        ({ originMessageId }) => originMessageId === fixture.followUpAnswer.id,
      )?.regeneratedFromAnswerId,
    ).toBeNull();
    expect(
      allMessages.some(
        ({ originMessageId, content }) =>
          originMessageId !== null && content === "Regeneration source answer",
      ),
    ).toBe(false);
  });

  test("keeps original and copied history branches navigable after reload", async () => {
    const fixture = await historyFixture("Navigable copied history");
    const copiedLeaf = await store.reviseQuestionWithHistory({
      threadId: fixture.thread.id,
      questionMessageId: fixture.original.id,
      expectedSelectedLeafMessageId: fixture.followUpAnswer.id,
      content: "Edited root question",
    });
    const copied = await store.projectSelectedPath({
      sourceId,
      stateId,
      threadId: fixture.thread.id,
    });
    const [question, answer, followUp, followUpAnswer] = copied?.messages ?? [];

    await expect(
      store.reviseQuestionWithHistory({
        threadId: fixture.thread.id,
        questionMessageId: fixture.original.id,
        expectedSelectedLeafMessageId: fixture.followUpAnswer.id,
        content: "Stale edit",
      }),
    ).resolves.toBeUndefined();
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: fixture.thread.id,
      }),
    ).resolves.toEqual(copied);

    expect(
      await store.selectQuestionAlternative({
        threadId: fixture.thread.id,
        questionMessageId: fixture.original.id,
        expectedSelectedLeafMessageId: copiedLeaf?.id ?? "missing",
      }),
    ).toBe(true);
    const selectedSibling = await store.projectSelectedPath({
      sourceId,
      stateId,
      threadId: fixture.thread.id,
    });
    expect(
      await store.selectAnswerAlternative({
        threadId: fixture.thread.id,
        answerMessageId: fixture.answer.id,
        expectedSelectedLeafMessageId:
          selectedSibling?.messages.at(-1)?.id ?? "missing",
      }),
    ).toBe(true);
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: fixture.thread.id,
      }),
    ).resolves.toMatchObject({
      messages: [
        { id: fixture.original.id },
        { id: fixture.answer.id },
        { id: fixture.followUp.id },
        { id: fixture.followUpAnswer.id },
      ],
    });
    expect(
      await store.selectQuestionAlternative({
        threadId: fixture.thread.id,
        questionMessageId: question?.id ?? "missing",
        expectedSelectedLeafMessageId: fixture.followUpAnswer.id,
      }),
    ).toBe(true);
    await expect(
      new DrizzleResearchThreadStore(database).projectSelectedPath({
        sourceId,
        stateId,
        threadId: fixture.thread.id,
      }),
    ).resolves.toMatchObject({
      messages: [
        { id: question?.id },
        { id: answer?.id },
        { id: followUp?.id },
        { id: followUpAnswer?.id },
      ],
    });
  });

  test("rolls back every copied message when suffix copying fails", async () => {
    const fixture = await historyFixture("Rollback history");
    await database.execute(
      sql.raw(`
      CREATE FUNCTION reject_research_history_copy() RETURNS trigger AS $$
      BEGIN
        IF NEW.origin_message_id = '${fixture.followUp.id}'::uuid THEN
          RAISE EXCEPTION 'forced history copy failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_research_history_copy
      BEFORE INSERT ON research_thread_messages
      FOR EACH ROW EXECUTE FUNCTION reject_research_history_copy();
    `),
    );

    await expect(
      store.reviseQuestionWithHistory({
        threadId: fixture.thread.id,
        questionMessageId: fixture.original.id,
        expectedSelectedLeafMessageId: fixture.followUpAnswer.id,
        content: "Edit that must roll back",
      }),
    ).rejects.toMatchObject({
      cause: {
        message: expect.stringContaining("forced history copy failure"),
      },
    });
    await expect(
      store.projectSelectedPath({
        sourceId,
        stateId,
        threadId: fixture.thread.id,
      }),
    ).resolves.toMatchObject({
      messages: [
        { id: fixture.original.id },
        { id: fixture.answer.id },
        { id: fixture.followUp.id },
        { id: fixture.followUpAnswer.id },
      ],
    });
    const messages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, fixture.thread.id));
    expect(messages).toHaveLength(5);
  });

  async function historyFixture(title: string) {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title,
    });
    const original = await store.appendQuestion({
      threadId: thread.id,
      expectedSelectedLeafMessageId: null,
      content: "Original root question",
      selectedText: "Selected evidence",
      temporaryEvidence: [{ filename: "root.txt", mediaType: "text/plain" }],
    });
    if (!original) throw new Error("Original question was not created");
    const reference = {
      id: "91000000-0000-4000-8000-000000000000",
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
      occurrences: [
        {
          id: "92000000-0000-4000-8000-000000000000",
          referenceId: "91000000-0000-4000-8000-000000000000",
          presentation: "passing" as const,
          relation: "supports" as const,
          answerTarget: { startOffset: 15, endOffset: 52 },
        },
      ],
    };
    const regenerationSource = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: original.id,
      content: "Regeneration source answer",
      model: "z-ai/glm-5.3-flash",
    });
    if (!regenerationSource)
      throw new Error("Regeneration source answer was not created");
    const answer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: thread.id,
      questionMessageId: original.id,
      expectedSelectedLeafMessageId: regenerationSource.id,
      content: `Grounded answer.[^${reference.occurrences[0]?.id}]`,
      model: "z-ai/glm-5.3-flash",
      regeneratedFromAnswerId: regenerationSource.id,
      references: [reference],
    });
    if (!answer) throw new Error("Original answer was not created");
    const followUp = await store.appendQuestion({
      threadId: thread.id,
      expectedSelectedLeafMessageId: answer.id,
      content: "Original follow-up",
      selectedText: "Follow-up evidence",
      temporaryEvidence: [
        { filename: "follow-up.txt", mediaType: "text/plain" },
      ],
    });
    if (!followUp) throw new Error("Follow-up question was not created");
    const followUpAnswer = await store.commitAnswer({
      answerMessageId: randomUUID(),
      threadId: thread.id,
      questionMessageId: followUp.id,
      expectedSelectedLeafMessageId: followUp.id,
      content: "Original downstream answer",
      model: "moonshotai/kimi-k3",
      references: [reference],
    });
    if (!followUpAnswer) throw new Error("Follow-up answer was not created");
    return {
      thread,
      original,
      regenerationSource,
      answer,
      followUp,
      followUpAnswer,
    };
  }
});
