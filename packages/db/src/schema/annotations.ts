import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  authoredTextChecks,
  authoredTextColumns,
  inVocabulary,
} from "./authored-text-columns";
import { sourceStates, sources } from "./sources";

export const annotationKinds = ["highlight", "note"] as const;
export const annotationColors = ["yellow", "green", "blue", "pink"] as const;

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    sourceStateId: uuid("source_state_id").notNull(),
    componentIdentity: text("component_identity").notNull(),
    kind: text("kind").notNull(),
    ...authoredTextColumns(),
    color: text("color").notNull(),
    body: text("body"),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceStateId, table.sourceId],
      foreignColumns: [sourceStates.id, sourceStates.sourceId],
      name: "annotations_source_state_source_fk",
    }).onDelete("cascade"),
    index("annotations_source_state_component_idx").on(
      table.sourceStateId,
      table.componentIdentity,
      table.normalizedStartOffset,
    ),
    ...authoredTextChecks(table, "annotations"),
    check("annotations_kind_check", inVocabulary(table.kind, annotationKinds)),
    check(
      "annotations_color_check",
      inVocabulary(table.color, annotationColors),
    ),
  ],
);
