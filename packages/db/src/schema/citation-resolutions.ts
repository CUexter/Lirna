import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { sourceStateDerivatives, sourceStates } from "./sources";

export const citationResolutions = pgTable(
  "citation_resolutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id").notNull(),
    derivativeId: uuid("derivative_id").notNull(),
    componentIdentity: text("component_identity").notNull(),
    mentionId: text("mention_id").notNull(),
    bibliographyComponentIdentity: text("bibliography_component_identity"),
    bibliographyEntryId: text("bibliography_entry_id"),
    publisherAnchor: text("publisher_anchor"),
    offsetBasis: text("offset_basis").notNull(),
    normalizedStartOffset: integer("start_offset").notNull(),
    normalizedEndOffset: integer("end_offset").notNull(),
    exactText: text("exact_text").notNull(),
    prefix: text("prefix").notNull(),
    suffix: text("suffix").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    method: text("method").notNull(),
    confidence: real("confidence"),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceStateId],
      foreignColumns: [sourceStates.id],
      name: "citation_resolution_state_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.derivativeId],
      foreignColumns: [sourceStateDerivatives.id],
      name: "citation_resolution_derivative_fk",
    }).onDelete("restrict"),
    index("citation_resolutions_source_state_component_idx").on(
      table.sourceStateId,
      table.componentIdentity,
      table.mentionId,
      table.createdAt,
    ),
    check(
      "citation_resolutions_offsets_check",
      sql`${table.normalizedStartOffset} >= 0 AND ${table.normalizedEndOffset} > ${table.normalizedStartOffset}`,
    ),
    check(
      "citation_resolutions_offset_basis_check",
      sql`${table.offsetBasis} = 'normalized-derivative-text-v1'`,
    ),
    check(
      "citation_resolutions_action_check",
      sql`${table.action} IN ('selected', 'cleared')`,
    ),
    check(
      "citation_resolutions_method_check",
      sql`${table.method} IN ('manual', 'inferred')`,
    ),
    check(
      "citation_resolutions_target_check",
      sql`(${table.action} = 'selected' AND ${table.bibliographyComponentIdentity} IS NOT NULL AND ${table.bibliographyEntryId} IS NOT NULL) OR (${table.action} = 'cleared' AND ${table.bibliographyComponentIdentity} IS NULL AND ${table.bibliographyEntryId} IS NULL)`,
    ),
    check(
      "citation_resolutions_inference_check",
      sql`(${table.method} = 'manual' AND ${table.confidence} IS NULL AND ${table.reasoning} IS NULL) OR (${table.method} = 'inferred' AND ${table.action} = 'selected' AND ${table.confidence} BETWEEN 0 AND 1 AND length(${table.reasoning}) > 0)`,
    ),
    check(
      "citation_resolutions_exact_text_check",
      sql`length(${table.exactText}) > 0`,
    ),
  ],
);
