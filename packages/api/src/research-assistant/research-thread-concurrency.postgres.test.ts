import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { researchThreadMessages } from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq } from "drizzle-orm";

import { DrizzleResearchThreadStore } from "./research-thread-store";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_thread_concurrency_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: DrizzleResearchThreadStore;

describePostgres("Research thread PostgreSQL concurrency", () => {
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

  test("lets one concurrent question append win without retaining the loser", async () => {
    const thread = await store.create({
      sourceId,
      stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Concurrent inquiry",
    });
    const appended = await Promise.all([
      store.appendQuestion({
        threadId: thread.id,
        expectedSelectedLeafMessageId: null,
        content: "First concurrent question",
      }),
      store.appendQuestion({
        threadId: thread.id,
        expectedSelectedLeafMessageId: null,
        content: "Second concurrent question",
      }),
    ]);
    expect(appended.filter(Boolean)).toHaveLength(1);
    const messages = await database
      .select()
      .from(researchThreadMessages)
      .where(eq(researchThreadMessages.researchThreadId, thread.id));
    expect(messages).toHaveLength(1);
    await expect(
      store.projectSelectedPath({ sourceId, stateId, threadId: thread.id }),
    ).resolves.toMatchObject({ messages: [{ id: messages[0]?.id }] });
  });
});
