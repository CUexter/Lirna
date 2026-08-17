import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { capturedResourceColumns, policyChecks } from "./source-schema-helpers";

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    stableKey: text("stable_key"),
    admittedAt: timestamp("admitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("sources_stable_key_unique").on(table.stableKey)],
);

export const sourceStates = pgTable(
  "source_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    sequence: integer("sequence").notNull(),
    adapterId: text("adapter_id").notNull(),
    observationKey: text("observation_key"),
    canonicalUrl: text("canonical_url"),
    rightsBasis: text("rights_basis").notNull(),
    sensitivityLevel: text("sensitivity_level").notNull(),
    admittedAt: timestamp("admitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_states_source_sequence_unique").on(
      table.sourceId,
      table.sequence,
    ),
    index("source_states_source_admitted_at_idx").on(
      table.sourceId,
      table.admittedAt,
    ),
    check("source_states_sequence_check", sql`${table.sequence} >= 0`),
    ...policyChecks(table, "source_states"),
  ],
);

export const sourceRelations = pgTable(
  "source_relations",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    relatedSourceId: uuid("related_source_id")
      .notNull()
      .references(() => sources.id),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceId, table.relatedSourceId, table.kind],
    }),
    check(
      "source_relations_distinct_sources_check",
      sql`${table.sourceId} <> ${table.relatedSourceId}`,
    ),
    check(
      "source_relations_kind_check",
      sql`${table.kind} IN ('replacement-capture-for')`,
    ),
  ],
);

export const sourceStateResources = pgTable(
  "source_state_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id),
    ...capturedResourceColumns(),
  },
  (table) => [
    index("source_state_resources_state_idx").on(table.sourceStateId),
    index("source_state_resources_state_hash_idx").on(
      table.sourceStateId,
      table.sha256,
    ),
    check(
      "source_state_resources_status_check",
      sql`${table.status} BETWEEN 100 AND 599`,
    ),
    check(
      "source_state_resources_byte_length_check",
      sql`${table.byteLength} >= 0 AND octet_length(${table.body}) = ${table.byteLength}`,
    ),
    check(
      "source_state_resources_sha256_check",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "source_state_resources_request_metrics_check",
      sql`${table.requestCount} >= 1 AND ${table.downloadedBytes} >= ${table.byteLength}`,
    ),
    check("source_state_resources_depth_check", sql`${table.depth} >= 0`),
  ],
);

export const sourceStateDerivatives = pgTable(
  "source_state_derivatives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id").notNull(),
    kind: text("kind").notNull(),
    previousDerivativeId: uuid("previous_derivative_id"),
    valid: boolean("valid").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    validation: jsonb("validation").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceStateId],
      foreignColumns: [sourceStates.id],
      name: "source_state_derivatives_state_fk",
    }),
    foreignKey({
      columns: [table.previousDerivativeId],
      foreignColumns: [table.id],
      name: "source_state_derivatives_previous_fk",
    }),
    index("source_state_derivatives_state_kind_created_idx").on(
      table.sourceStateId,
      table.kind,
      table.createdAt,
    ),
  ],
);

export const sourceStateDerivativeActivations = pgTable(
  "source_state_derivative_activations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id").notNull(),
    derivativeId: uuid("derivative_id").notNull(),
    kind: text("kind").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceStateId],
      foreignColumns: [sourceStates.id],
      name: "source_state_activations_state_fk",
    }),
    foreignKey({
      columns: [table.derivativeId],
      foreignColumns: [sourceStateDerivatives.id],
      name: "source_state_activations_derivative_fk",
    }),
    index("source_state_derivative_activations_current_idx").on(
      table.sourceStateId,
      table.kind,
      table.activatedAt,
    ),
  ],
);
