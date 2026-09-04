import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  researchEvidenceReceipts,
  researchThreads,
} from "@lirna/db/schema/research-threads";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { eq } from "drizzle-orm";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_evidence_receipts_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const threadId = "30000000-0000-4000-8000-000000000000";
const questionMessageId = "40000000-0000-4000-8000-000000000000";
const attemptedAnswerMessageId = "50000000-0000-4000-8000-000000000000";

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;
let store: InstanceType<
  typeof import("./research-evidence-receipt-store")["DrizzleResearchEvidenceReceiptStore"]
>;

describePostgres("Research evidence receipt PostgreSQL store", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
    const { DrizzleResearchEvidenceReceiptStore } = await import(
      "./research-evidence-receipt-store"
    );
    store = new DrizzleResearchEvidenceReceiptStore(database);
    await database.insert(sources).values({
      id: sourceId,
      title: "Test entry",
      stableKey: `research-evidence-receipt:${sourceId}`,
    });
    await database.insert(sourceStates).values({
      id: stateId,
      sourceId,
      sequence: 0,
      adapterId: "test",
      rightsBasis: "owned",
      sensitivityLevel: "ordinary-cloud",
    });
    await database.insert(researchThreads).values({
      id: threadId,
      sourceStateId: stateId,
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      title: "Receipt thread",
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupDatabase?.();
  });

  test("persists a content-free receipt for its Research thread", async () => {
    await store.record({
      sessionId: "session_test",
      sourceStateId: stateId,
      resolverVersion: "lexical-v1",
      indexVersion: "reading-components-v1",
      budget: {
        maximumDiscoveries: 12,
        maximumCandidatesPerDiscovery: 5,
        maximumAdmissions: 12,
        maximumModelSteps: 8,
        maximumTotalEvidenceCharacters: 100_000,
      },
      consumption: {
        discoveries: 2,
        candidates: 3,
        admissions: 2,
        modelSteps: 4,
        evidenceCharacters: 512,
      },
      candidateCount: 5,
      reasonCodes: ["close-ranked-passages"],
      admittedCount: 2,
      refusedCount: 1,
      budgetExhausted: false,
      researchThreadId: threadId,
      questionMessageId,
      attemptedAnswerMessageId,
      outcome: "successful",
      latencyBucket: "1s-5s",
    });

    const [row] = await database
      .select()
      .from(researchEvidenceReceipts)
      .where(eq(researchEvidenceReceipts.researchThreadId, threadId));

    expect(row).toMatchObject({
      sessionId: "session_test",
      researchThreadId: threadId,
      questionMessageId,
      attemptedAnswerMessageId,
      sourceStateId: stateId,
      outcome: "successful",
      latencyBucket: "1s-5s",
      admittedCount: 2,
      refusedCount: 1,
      budgetExhausted: false,
      reasonCodes: ["close-ranked-passages"],
      terminalReasonCode: null,
    });
  });

  test("rejects a receipt with an unknown outcome", async () => {
    await expect(
      store.record({
        sessionId: "session_test",
        sourceStateId: stateId,
        resolverVersion: "lexical-v1",
        indexVersion: "reading-components-v1",
        budget: {
          maximumDiscoveries: 1,
          maximumCandidatesPerDiscovery: 2,
          maximumAdmissions: 1,
          maximumModelSteps: 8,
          maximumTotalEvidenceCharacters: 1_000,
        },
        consumption: {
          discoveries: 0,
          candidates: 0,
          admissions: 0,
          modelSteps: 0,
          evidenceCharacters: 0,
        },
        candidateCount: 0,
        reasonCodes: [],
        admittedCount: 0,
        refusedCount: 0,
        budgetExhausted: false,
        researchThreadId: threadId,
        questionMessageId,
        attemptedAnswerMessageId,
        outcome: "mysterious" as never,
        latencyBucket: "under-100ms",
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
