import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { sourceStates } from "./sources";

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id, { onDelete: "cascade" }),
    componentIdentity: text("component_identity").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    exactText: text("exact_text").notNull(),
    color: text("color").notNull(),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("annotations_source_state_component_idx").on(
      table.sourceStateId,
      table.componentIdentity,
      table.startOffset,
    ),
    check(
      "annotations_offsets_check",
      sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`,
    ),
    check(
      "annotations_color_check",
      sql`${table.color} IN ('yellow', 'green', 'blue', 'pink')`,
    ),
    check("annotations_exact_text_check", sql`length(${table.exactText}) > 0`),
  ],
);
