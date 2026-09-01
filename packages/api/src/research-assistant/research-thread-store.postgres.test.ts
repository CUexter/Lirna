import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { researchThreads } from "@lirna/db/schema/research-threads";
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

  test("persists, lists, and resumes an ordered conversation", async () => {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "What is the central claim?",
    });
    await store.append({
      threadId: thread.id,
      role: "user",
      content: "What is the central claim?",
      selectedText: "Selected evidence",
    });
    await store.append({
      threadId: thread.id,
      role: "assistant",
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

    await expect(store.list({ sourceId, stateId })).resolves.toMatchObject([
      { id: thread.id },
    ]);
    await expect(
      store.get({
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
    await database
      .delete(researchThreads)
      .where(eq(researchThreads.id, thread.id));
    await expect(
      store.get({
        sourceId,
        stateId,
        threadId: thread.id,
      }),
    ).resolves.toBeUndefined();
  });
});
