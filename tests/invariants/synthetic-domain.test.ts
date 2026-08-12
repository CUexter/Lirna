import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/database/migrate.js";
import {
  DomainDatabase,
  ModuleWriteOwnershipError,
  RevisionInvariantError,
} from "../../src/domain/synthetic-domain.js";

/**
 * Focused invariant tests at the module contract seam. These prove the
 * transactional-outbox properties the application-level scenario cannot
 * reliably isolate: partial-write rollback, module write ownership, and
 * database-enforced immutable history.
 */
describe("synthetic domain invariants", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
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
    database = new DomainDatabase(databaseUrl);
  });

  afterAll(async () => {
    await database?.close();
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
      database.pool.query(
        "UPDATE synthetic_record_revisions SET note = 'tampered' WHERE record_id = $1",
        [id],
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      database.pool.query(
        "DELETE FROM synthetic_record_revisions WHERE record_id = $1",
        [id],
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it("drains recorded outbox events exactly once", async () => {
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
});
