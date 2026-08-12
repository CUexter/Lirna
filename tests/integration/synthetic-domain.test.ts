import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { ApplicationDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import {
  DomainDatabase,
  ModuleWriteOwnershipError,
  RevisionInvariantError,
} from "../../server/domain/synthetic-domain.js";
import { executeTestSql, resetTestDatabase } from "./database-test-support.js";

/**
 * Focused invariant tests at the module contract seam. These prove the
 * transactional-outbox properties the application-level scenario cannot
 * reliably isolate: partial-write rollback, module write ownership, and
 * database-enforced immutable history.
 */
describe("synthetic domain invariants", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
  let applicationDatabase: ApplicationDatabase;
  let database: DomainDatabase;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = container.getConnectionUri();
      stopDatabase = () => container.stop().then(() => undefined);
    }
    await migrate(databaseUrl);
    applicationDatabase = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(applicationDatabase.db);
    database = new DomainDatabase(applicationDatabase.db);
  });

  afterAll(async () => {
    await applicationDatabase?.close();
    await stopDatabase?.();
  });

  it("keeps stable identity while appending immutable history", async () => {
    const alpha = database.module("alpha");
    const id = randomUUID();

    const first = await alpha.revise({
      recordId: id,
      label: "first",
      payload: { step: 1 },
      note: "created",
    });
    const second = await alpha.revise({
      recordId: id,
      label: "second",
      payload: { step: 2 },
      note: "revised",
    });

    // Identity survives the revision; the revision number advances.
    expect(second.id).toBe(first.id);
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);

    const view = await alpha.view(id);
    expect(view?.state).toEqual({ label: "second", payload: { step: 2 } });
    expect(view?.history.map((entry) => entry.revision)).toEqual([1, 2]);
    expect(view?.history[0]?.state).toEqual({ label: "first", payload: { step: 1 } });
    // One outbox event was recorded per revision.
    expect(view?.events.map((event) => event.revision)).toEqual([1, 2]);
  });

  it("commits state, history, and outbox together or not at all", async () => {
    const alpha = database.module("alpha");
    const id = randomUUID();
    await alpha.revise({
      recordId: id,
      label: "baseline",
      payload: { step: 1 },
      note: "created",
    });

    // A fault injected after state and history are written but before the
    // outbox event must roll back every write in the transaction.
    await expect(
      alpha.revise(
        {
          recordId: id,
          label: "doomed",
          payload: { step: 2 },
          note: "should roll back",
        },
        {
          beforeOutbox: () => {
            throw new Error("injected fault before outbox write");
          },
        },
      ),
    ).rejects.toThrow(/injected/i);

    const view = await alpha.view(id);
    expect(view?.revision).toBe(1);
    expect(view?.state).toEqual({ label: "baseline", payload: { step: 1 } });
    expect(view?.history).toHaveLength(1);
    expect(view?.events).toHaveLength(1);
  });

  it("rejects a revision that violates the record invariant without side effects", async () => {
    const alpha = database.module("alpha");
    const id = randomUUID();

    await expect(
      alpha.revise({ recordId: id, label: "", payload: {}, note: "invalid" }),
    ).rejects.toBeInstanceOf(RevisionInvariantError);

    expect(await alpha.view(id)).toBeUndefined();
  });

  it("forbids a module from writing another module's owned record", async () => {
    const alpha = database.module("alpha");
    const beta = database.module("beta");
    const id = randomUUID();

    await alpha.revise({
      recordId: id,
      label: "owned by alpha",
      payload: {},
      note: "created",
    });

    await expect(
      beta.revise({
        recordId: id,
        label: "beta intrusion",
        payload: {},
        note: "not allowed",
      }),
    ).rejects.toBeInstanceOf(ModuleWriteOwnershipError);

    const view = await alpha.view(id);
    expect(view?.ownerModule).toBe("alpha");
    expect(view?.revision).toBe(1);
    expect(view?.history).toHaveLength(1);
  });

  it("refuses to rewrite recorded history at the database boundary", async () => {
    const alpha = database.module("alpha");
    const id = randomUUID();
    await alpha.revise({
      recordId: id,
      label: "immutable",
      payload: {},
      note: "created",
    });

    await expect(
      executeTestSql(applicationDatabase.db, sql`
        UPDATE synthetic_record_revisions SET note = 'tampered' WHERE record_id = ${id}
      `),
    ).rejects.toThrow(/append-only/i);
    await expect(
      executeTestSql(applicationDatabase.db, sql`
        DELETE FROM synthetic_record_revisions WHERE record_id = ${id}
      `),
    ).rejects.toThrow(/append-only/i);
  });

  it("does not redeliver events after their publication is recorded", async () => {
    const gamma = database.module("gamma");
    const id = randomUUID();
    await gamma.revise({ recordId: id, label: "one", payload: {}, note: "created" });
    await gamma.revise({ recordId: id, label: "two", payload: {}, note: "revised" });

    const relay = database.relay();
    const published: string[] = [];
    const drained = await relay.drainOnce(async (event) => {
      published.push(event.id);
    });

    expect(drained).toBeGreaterThanOrEqual(2);
    expect(published.length).toBe(drained);

    // Draining again publishes nothing: already-published events are skipped.
    const second: string[] = [];
    await relay.drainOnce(async (event) => {
      second.push(event.id);
    });
    expect(second).toHaveLength(0);

    const view = await gamma.view(id);
    expect(view?.events.every((event) => event.publishedAt !== null)).toBe(true);
  });

  it("redelivers the same event id when publication succeeds before the transaction fails", async () => {
    const module = database.module("at-least-once");
    const recordId = randomUUID();
    await module.revise({ recordId, label: "one", payload: {}, note: "created" });

    const delivered: string[] = [];
    await expect(
      database.relay().drainOnce(
        async (event) => {
          delivered.push(event.id);
        },
        1,
        {
          afterPublish: () => {
            throw new Error("injected failure after publication");
          },
        },
      ),
    ).rejects.toThrow(/after publication/);

    expect(await database.relay().pendingCount()).toBeGreaterThanOrEqual(1);
    await database.relay().drainOnce(async (event) => {
      if (event.id === delivered[0]) delivered.push(event.id);
    });
    expect(delivered).toEqual([delivered[0], delivered[0]]);
  });

  it("partitions concurrent outbox drains without duplicate publication", async () => {
    const delta = database.module("delta");
    for (let index = 0; index < 4; index += 1) {
      await delta.revise({
        recordId: randomUUID(),
        label: `record ${index}`,
        payload: {},
        note: "created",
      });
    }
    const published: string[] = [];
    const publish = async (event: { id: string }) => {
      published.push(event.id);
    };

    const drained = await Promise.all([
      database.relay().drainOnce(publish, 2),
      database.relay().drainOnce(publish, 2),
    ]);

    expect(drained).toEqual([2, 2]);
    expect(new Set(published).size).toBe(4);
    expect(await database.relay().pendingCount()).toBe(0);
  });
});
