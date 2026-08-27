import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  authoredTextChecks,
  authoredTextColumns,
  inVocabulary,
} from "./authored-text-columns";
import { sourceStateDerivatives, sourceStates } from "./sources";

export const citationResolutionActions = ["selected", "cleared"] as const;
export const citationResolutionMethods = ["manual", "inferred"] as const;

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
    ...authoredTextColumns(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    method: text("method").notNull(),
    confidence: real("confidence"),
    reasoning: text("reasoning"),
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
    ...authoredTextChecks(table, "citation_resolutions"),
    check(
      "citation_resolutions_action_check",
      inVocabulary(table.action, citationResolutionActions),
    ),
    check(
      "citation_resolutions_method_check",
      inVocabulary(table.method, citationResolutionMethods),
    ),
    check(
      "citation_resolutions_target_check",
      sql`(${table.action} = 'selected' AND ${table.bibliographyComponentIdentity} IS NOT NULL AND ${table.bibliographyEntryId} IS NOT NULL) OR (${table.action} = 'cleared' AND ${table.bibliographyComponentIdentity} IS NULL AND ${table.bibliographyEntryId} IS NULL)`,
    ),
    check(
      "citation_resolutions_inference_check",
      sql`(${table.method} = 'manual' AND ${table.confidence} IS NULL AND ${table.reasoning} IS NULL) OR (${table.method} = 'inferred' AND ${table.action} = 'selected' AND ${table.confidence} BETWEEN 0 AND 1 AND length(${table.reasoning}) > 0)`,
    ),
  ],
);
