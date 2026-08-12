import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { SyntheticState } from "./synthetic-domain.js";

export const syntheticRecords = pgTable(
  "synthetic_records",
  {
    id: uuid().primaryKey(),
    ownerModule: text("owner_module").notNull(),
    revision: integer().notNull(),
    state: jsonb().$type<SyntheticState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("synthetic_records_revision_check", sql`${table.revision} >= 1`)],
);

export const syntheticRecordRevisions = pgTable(
  "synthetic_record_revisions",
  {
    recordId: uuid("record_id").notNull().references(() => syntheticRecords.id),
    revision: integer().notNull(),
    ownerModule: text("owner_module").notNull(),
    state: jsonb().$type<SyntheticState>().notNull(),
    note: text().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.revision] }),
    check("synthetic_record_revisions_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const domainOutbox = pgTable(
  "domain_outbox",
  {
    id: uuid().primaryKey(),
    recordId: uuid("record_id").notNull(),
    ownerModule: text("owner_module").notNull(),
    eventType: text("event_type").notNull(),
    revision: integer().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    check("domain_outbox_revision_check", sql`${table.revision} >= 1`),
    index("domain_outbox_unpublished")
      .on(table.occurredAt)
      .where(sql`${table.publishedAt} is null`),
  ],
);
