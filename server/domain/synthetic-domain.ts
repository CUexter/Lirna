import { randomUUID } from "node:crypto";
import { asc, count, eq, isNull } from "drizzle-orm";
import type { LirnaDatabase } from "../database/database.js";
import {
  domainOutbox,
  syntheticRecordRevisions,
  syntheticRecords,
} from "./schema.js";

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

/**
 * A synthetic domain module bound to one owning module name. It exclusively
 * owns writes to its records and records current state, immutable history, and
 * an outbound event in one atomic transaction.
 */
export class SyntheticDomainModule {
  constructor(
    private readonly db: LirnaDatabase,
    readonly moduleName: string,
  ) {}

  async revise(command: ReviseCommand, hooks: ReviseHooks = {}): Promise<SyntheticRecordView> {
    if (command.label.trim().length === 0) {
      throw new RevisionInvariantError("A synthetic record requires a non-empty label");
    }
    if (!isJsonObject(command.payload)) {
      throw new RevisionInvariantError("A synthetic record payload must be a JSON object");
    }

    const state: SyntheticState = {
      label: command.label,
      payload: command.payload,
    };

    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          ownerModule: syntheticRecords.ownerModule,
          revision: syntheticRecords.revision,
        })
        .from(syntheticRecords)
        .where(eq(syntheticRecords.id, command.recordId))
        .for("update");
      if (current && current.ownerModule !== this.moduleName) {
        throw new ModuleWriteOwnershipError(
          command.recordId,
          current.ownerModule,
          this.moduleName,
        );
      }

      const nextRevision = current ? current.revision + 1 : 1;

      if (current) {
        await tx
          .update(syntheticRecords)
          .set({ revision: nextRevision, state, updatedAt: new Date() })
          .where(eq(syntheticRecords.id, command.recordId));
      } else {
        await tx.insert(syntheticRecords).values({
          id: command.recordId,
          ownerModule: this.moduleName,
          revision: nextRevision,
          state,
        });
      }

      await tx.insert(syntheticRecordRevisions).values({
        recordId: command.recordId,
        revision: nextRevision,
        ownerModule: this.moduleName,
        state,
        note: command.note,
      });

      // Runs after state and history are written but before the outbox event.
      await hooks.beforeOutbox?.();

      await tx.insert(domainOutbox).values({
        id: randomUUID(),
        recordId: command.recordId,
        ownerModule: this.moduleName,
        eventType: "synthetic-record-revised",
        revision: nextRevision,
        payload: { label: state.label, revision: nextRevision },
      });
    });

    const view = await this.view(command.recordId);
    if (!view) {
      throw new Error(`Record ${command.recordId} vanished after revision`);
    }
    return view;
  }

  view(recordId: string): Promise<SyntheticRecordView | undefined> {
    return readRecordView(this.db, recordId);
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

/**
 * Reads current state, immutable history, and recorded outbox events for one
 * record. Reads are module-neutral; only writes are ownership-scoped. The three
 * reads run in one repeatable-read transaction so the returned view is a single
 * consistent snapshot even while a concurrent revision commits.
 */
export async function readRecordView(
  db: LirnaDatabase,
  recordId: string,
): Promise<SyntheticRecordView | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        ownerModule: syntheticRecords.ownerModule,
        revision: syntheticRecords.revision,
        state: syntheticRecords.state,
      })
      .from(syntheticRecords)
      .where(eq(syntheticRecords.id, recordId));
    if (!row) {
      return undefined;
    }

    const history = await tx
      .select({
        revision: syntheticRecordRevisions.revision,
        state: syntheticRecordRevisions.state,
        note: syntheticRecordRevisions.note,
        recordedAt: syntheticRecordRevisions.recordedAt,
      })
      .from(syntheticRecordRevisions)
      .where(eq(syntheticRecordRevisions.recordId, recordId))
      .orderBy(asc(syntheticRecordRevisions.revision));

    const events = await tx
      .select({
        id: domainOutbox.id,
        eventType: domainOutbox.eventType,
        revision: domainOutbox.revision,
        payload: domainOutbox.payload,
        publishedAt: domainOutbox.publishedAt,
      })
      .from(domainOutbox)
      .where(eq(domainOutbox.recordId, recordId))
      .orderBy(asc(domainOutbox.occurredAt), asc(domainOutbox.revision));

    return {
      id: recordId,
      ownerModule: row.ownerModule,
      revision: row.revision,
      state: requireSyntheticState(row.state),
      history: history.map((entry) => ({
        revision: entry.revision,
        state: requireSyntheticState(entry.state),
        note: entry.note,
        recordedAt: entry.recordedAt.toISOString(),
      })),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        revision: event.revision,
        payload: requireJsonObject(event.payload, "outbox payload"),
        publishedAt: event.publishedAt ? event.publishedAt.toISOString() : null,
      })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

function requireSyntheticState(value: unknown): SyntheticState {
  const state = requireJsonObject(value, "synthetic state");
  if (typeof state.label !== "string" || !isJsonObject(state.payload)) {
    throw new RevisionInvariantError("Persisted synthetic state is invalid");
  }
  return { label: state.label, payload: state.payload };
}

function requireJsonObject(value: unknown, name: string): Record<string, unknown> {
  if (!isJsonObject(value)) throw new RevisionInvariantError(`Persisted ${name} is invalid`);
  return value;
}

/**
 * Drains the transactional outbox. A relay publishes recorded events and marks
 * them published; draining is idempotent because already-published events are
 * skipped.
 */
export class OutboxRelay {
  constructor(private readonly db: LirnaDatabase) {}

  async drainOnce(
    publish: (event: OutboxEventView & { ownerModule: string }) => Promise<void>,
    limit = 32,
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pending = await tx
        .select({
          id: domainOutbox.id,
          ownerModule: domainOutbox.ownerModule,
          eventType: domainOutbox.eventType,
          revision: domainOutbox.revision,
          payload: domainOutbox.payload,
        })
        .from(domainOutbox)
        .where(isNull(domainOutbox.publishedAt))
        .orderBy(asc(domainOutbox.occurredAt))
        .limit(limit)
        .for("update", { skipLocked: true });

      for (const event of pending) {
        await publish({
          id: event.id,
          ownerModule: event.ownerModule,
          eventType: event.eventType,
          revision: event.revision,
          payload: event.payload,
          publishedAt: null,
        });
        await tx
          .update(domainOutbox)
          .set({ publishedAt: new Date() })
          .where(eq(domainOutbox.id, event.id));
      }

      return pending.length;
    });
  }

  async pendingCount(): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(domainOutbox)
      .where(isNull(domainOutbox.publishedAt));
    return result?.count ?? 0;
  }
}

/**
 * Hands out module contracts and the outbox relay. Modules coordinate through
 * the outbox rather than by writing one another's tables.
 */
export class DomainDatabase {
  private readonly modules = new Map<string, SyntheticDomainModule>();

  constructor(private readonly db: LirnaDatabase) {}

  module(name: string): SyntheticDomainModule {
    let module = this.modules.get(name);
    if (!module) {
      module = new SyntheticDomainModule(this.db, name);
      this.modules.set(name, module);
    }
    return module;
  }

  relay(): OutboxRelay {
    return new OutboxRelay(this.db);
  }

  view(recordId: string): Promise<SyntheticRecordView | undefined> {
    return readRecordView(this.db, recordId);
  }
}
