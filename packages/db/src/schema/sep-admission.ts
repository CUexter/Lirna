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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { capturedResourceColumns, policyChecks } from "./source-schema-helpers";
import { sourceStates, sources } from "./sources";

function sepPublicationMetadataColumns() {
  return {
    title: text("title").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull(),
    publisher: text("publisher").notNull(),
    publicationHistory: jsonb("publication_history")
      .$type<string[]>()
      .notNull(),
  };
}

export const sepAdmissionPreviews = pgTable(
  "sep_admission_previews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stableKey: text("stable_key").notNull(),
    submittedUrl: text("submitted_url").notNull(),
    recommendedArchiveUrl: text("recommended_archive_url"),
    ...sepPublicationMetadataColumns(),
    diagnostics: jsonb("diagnostics").$type<unknown[]>().notNull(),
    captureDiagnostics: jsonb("capture_diagnostics").$type<unknown>().notNull(),
    rightsBasis: text("rights_basis").notNull(),
    sensitivityLevel: text("sensitivity_level").notNull(),
    replacesSourceId: uuid("replaces_source_id").references(() => sources.id),
    processingMilliseconds: integer("processing_milliseconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sep_admission_previews_expires_at_idx").on(table.expiresAt),
    check(
      "sep_admission_previews_stable_key_check",
      sql`${table.stableKey} LIKE 'sep:%'`,
    ),
    check(
      "sep_admission_previews_processing_time_check",
      sql`${table.processingMilliseconds} >= 0`,
    ),
    check(
      "sep_admission_previews_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    ...policyChecks(table, "sep_admission_previews"),
  ],
);

export const sepPreviewResources = pgTable(
  "sep_preview_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    previewId: uuid("preview_id")
      .notNull()
      .references(() => sepAdmissionPreviews.id, { onDelete: "cascade" }),
    observationKey: text("observation_key").notNull(),
    ...capturedResourceColumns(),
  },
  (table) => [
    index("sep_preview_resources_preview_idx").on(table.previewId),
    uniqueIndex("sep_preview_resources_identity_unique").on(
      table.previewId,
      table.observationKey,
      table.identity,
    ),
    check(
      "sep_preview_resources_observation_key_check",
      sql`${table.observationKey} IN ('submitted', 'recommended-archive')`,
    ),
    check(
      "sep_preview_resources_status_check",
      sql`${table.status} BETWEEN 100 AND 599`,
    ),
    check(
      "sep_preview_resources_byte_length_check",
      sql`${table.byteLength} >= 0 AND octet_length(${table.body}) = ${table.byteLength}`,
    ),
    check(
      "sep_preview_resources_request_metrics_check",
      sql`${table.requestCount} >= 1 AND ${table.downloadedBytes} >= ${table.byteLength}`,
    ),
    check(
      "sep_preview_resources_sha256_check",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check("sep_preview_resources_depth_check", sql`${table.depth} >= 0`),
  ],
);

export const sepSourceStateMetadata = pgTable(
  "sep_source_state_metadata",
  {
    sourceStateId: uuid("source_state_id")
      .primaryKey()
      .references(() => sourceStates.id),
    admissionPreviewId: uuid("admission_preview_id").notNull(),
    observationKey: text("observation_key").notNull(),
    ...sepPublicationMetadataColumns(),
    diagnostics: jsonb("diagnostics").$type<unknown[]>().notNull(),
    captureDiagnostics: jsonb("capture_diagnostics").$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex("sep_source_state_metadata_admission_observation_unique").on(
      table.admissionPreviewId,
      table.observationKey,
    ),
    check(
      "sep_source_state_metadata_observation_key_check",
      sql`${table.observationKey} IN ('submitted', 'recommended-archive')`,
    ),
  ],
);

export const sepAdmissionOutcomes = pgTable(
  "sep_admission_outcomes",
  {
    admissionPreviewId: uuid("admission_preview_id").notNull(),
    observationKey: text("observation_key").notNull(),
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id),
    disposition: text("disposition").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.admissionPreviewId, table.observationKey],
    }),
    check(
      "sep_admission_outcomes_observation_key_check",
      sql`${table.observationKey} IN ('submitted', 'recommended-archive')`,
    ),
    check(
      "sep_admission_outcomes_disposition_check",
      sql`${table.disposition} IN ('created', 'unchanged')`,
    ),
  ],
);
