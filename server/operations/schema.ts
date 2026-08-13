import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type {
  ApplicationOperation,
  OperationKind,
  OperationStatus,
} from "./operation-repository.js";

export const applicationOperations = pgTable(
  "application_operations",
  {
    id: uuid().primaryKey(),
    kind: text().$type<OperationKind>().notNull(),
    input: text().notNull(),
    status: text().$type<OperationStatus>().notNull(),
    attempts: integer().default(0).notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    result: jsonb().$type<ApplicationOperation["result"]>(),
    artifactHash: text("artifact_hash"),
    error: text(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "application_operations_status_check",
      sql`${table.status} in ('queued', 'processing', 'completed', 'failed')`,
    ),
  ],
);
