import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

/** The immutable state carried by one synthetic record revision. */
export interface SyntheticState {
  label: string;
  payload: Record<string, unknown>;
}

export interface ReviseCommand {
  recordId: string;
  label: string;
  payload: Record<string, unknown>;
  note: string;
}

/**
 * Optional seams for a single revision. `beforeOutbox` runs after state and
 * history are written but before the outbox event; tests use it to prove the
 * three writes commit or roll back together without a hook leaking into the
 * public command shape.
 */
export interface ReviseHooks {
  beforeOutbox?: () => void | Promise<void>;
}

export interface RevisionEntry {
  revision: number;
  state: SyntheticState;
  note: string;
  recordedAt: string;
}

export interface OutboxEventView {
  id: string;
  eventType: string;
  revision: number;
  payload: Record<string, unknown>;
  publishedAt: string | null;
}

export interface SyntheticRecordView {
  id: string;
  ownerModule: string;
  revision: number;
  state: SyntheticState;
  history: RevisionEntry[];
  events: OutboxEventView[];
}

/** Raised when a module tries to write a record owned by another module. */
export class ModuleWriteOwnershipError extends Error {
  constructor(
    readonly recordId: string,
    readonly ownerModule: string,
    readonly actingModule: string,
  ) {
    super(
      `Module "${actingModule}" cannot write record ${recordId} owned by "${ownerModule}"`,
    );
    this.name = "ModuleWriteOwnershipError";
  }
}

/** Raised when a proposed revision violates the record invariant. */
export class RevisionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionInvariantError";
  }
}

interface CurrentRow {
  owner_module: string;
  revision: number;
}

/**
 * A synthetic domain module bound to one owning module name. It exclusively
 * owns writes to its records and records current state, immutable history, and
 * an outbound event in one atomic transaction.
 */
export class SyntheticDomainModule {
  constructor(
    private readonly pool: pg.Pool,
    readonly moduleName: string,
  ) {}

  async revise(command: ReviseCommand, hooks: ReviseHooks = {}): Promise<SyntheticRecordView> {
    if (command.label.trim().length === 0) {
      throw new RevisionInvariantError("A synthetic record requires a non-empty label");
    }

    const state: SyntheticState = {
      label: command.label,
      payload: command.payload,
    };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<CurrentRow>(
        `SELECT owner_module, revision
           FROM synthetic_records
          WHERE id = $1
          FOR UPDATE`,
        [command.recordId],
      );
      const current = existing.rows[0];
      if (current && current.owner_module !== this.moduleName) {
        throw new ModuleWriteOwnershipError(
          command.recordId,
          current.owner_module,
          this.moduleName,
        );
      }

      const nextRevision = current ? current.revision + 1 : 1;

      if (current) {
        await client.query(
          `UPDATE synthetic_records
              SET revision = $2, state = $3, updated_at = now()
            WHERE id = $1`,
          [command.recordId, nextRevision, state],
        );
      } else {
        await client.query(
          `INSERT INTO synthetic_records (id, owner_module, revision, state)
           VALUES ($1, $2, $3, $4)`,
          [command.recordId, this.moduleName, nextRevision, state],
        );
      }

      await client.query(
        `INSERT INTO synthetic_record_revisions
           (record_id, revision, owner_module, state, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [command.recordId, nextRevision, this.moduleName, state, command.note],
      );

      // Runs after state and history are written but before the outbox event.
      await hooks.beforeOutbox?.();

      await client.query(
        `INSERT INTO domain_outbox
           (id, record_id, owner_module, event_type, revision, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          command.recordId,
          this.moduleName,
          "synthetic-record-revised",
          nextRevision,
          { label: state.label, revision: nextRevision },
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const view = await this.view(command.recordId);
    if (!view) {
      throw new Error(`Record ${command.recordId} vanished after revision`);
    }
    return view;
  }

  view(recordId: string): Promise<SyntheticRecordView | undefined> {
    return readRecordView(this.pool, recordId);
  }
}

/**
 * Reads current state, immutable history, and recorded outbox events for one
 * record. Reads are module-neutral; only writes are ownership-scoped. The three
 * reads run in one repeatable-read transaction so the returned view is a single
 * consistent snapshot even while a concurrent revision commits.
 */
export async function readRecordView(
  pool: pg.Pool,
  recordId: string,
): Promise<SyntheticRecordView | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const record = await client.query<{
      owner_module: string;
      revision: number;
      state: SyntheticState;
    }>(
      `SELECT owner_module, revision, state
         FROM synthetic_records
        WHERE id = $1`,
      [recordId],
    );
    const row = record.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return undefined;
    }

    const history = await client.query<{
      revision: number;
      state: SyntheticState;
      note: string;
      recorded_at: Date;
    }>(
      `SELECT revision, state, note, recorded_at
         FROM synthetic_record_revisions
        WHERE record_id = $1
        ORDER BY revision`,
      [recordId],
    );

    const events = await client.query<{
      id: string;
      event_type: string;
      revision: number;
      payload: Record<string, unknown>;
      published_at: Date | null;
    }>(
      `SELECT id, event_type, revision, payload, published_at
         FROM domain_outbox
        WHERE record_id = $1
        ORDER BY occurred_at, revision`,
      [recordId],
    );
    await client.query("COMMIT");

    return {
      id: recordId,
      ownerModule: row.owner_module,
      revision: row.revision,
      state: row.state,
      history: history.rows.map((entry) => ({
        revision: entry.revision,
        state: entry.state,
        note: entry.note,
        recordedAt: entry.recorded_at.toISOString(),
      })),
      events: events.rows.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        revision: event.revision,
        payload: event.payload,
        publishedAt: event.published_at ? event.published_at.toISOString() : null,
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Drains the transactional outbox. A relay publishes recorded events and marks
 * them published; draining is idempotent because already-published events are
 * skipped.
 */
export class OutboxRelay {
  constructor(private readonly pool: pg.Pool) {}

  async drainOnce(
    publish: (event: OutboxEventView & { ownerModule: string }) => Promise<void>,
    limit = 32,
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const pending = await client.query<{
        id: string;
        owner_module: string;
        event_type: string;
        revision: number;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, owner_module, event_type, revision, payload
           FROM domain_outbox
          WHERE published_at IS NULL
          ORDER BY occurred_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1`,
        [limit],
      );

      for (const event of pending.rows) {
        await publish({
          id: event.id,
          ownerModule: event.owner_module,
          eventType: event.event_type,
          revision: event.revision,
          payload: event.payload,
          publishedAt: null,
        });
        await client.query(
          `UPDATE domain_outbox SET published_at = now() WHERE id = $1`,
          [event.id],
        );
      }

      await client.query("COMMIT");
      return pending.rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async pendingCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM domain_outbox WHERE published_at IS NULL`,
    );
    return Number(result.rows[0]?.count ?? "0");
  }
}

/**
 * Owns the domain connection pool and hands out module contracts and the
 * outbox relay. Modules coordinate through the outbox rather than by writing
 * one another's tables.
 */
export class DomainDatabase {
  readonly pool: pg.Pool;
  private readonly modules = new Map<string, SyntheticDomainModule>();

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  module(name: string): SyntheticDomainModule {
    let module = this.modules.get(name);
    if (!module) {
      module = new SyntheticDomainModule(this.pool, name);
      this.modules.set(name, module);
    }
    return module;
  }

  relay(): OutboxRelay {
    return new OutboxRelay(this.pool);
  }

  view(recordId: string): Promise<SyntheticRecordView | undefined> {
    return readRecordView(this.pool, recordId);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
