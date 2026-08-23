import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { sourceStates } from "./sources";

export const readingPositions = pgTable(
  "reading_positions",
  {
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id, { onDelete: "cascade" }),
    componentIdentity: text("component_identity").notNull(),
    componentLabel: text("component_label").notNull(),
    scrollTop: integer("scroll_top").notNull(),
    semanticLocation: jsonb("semantic_location"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceStateId, table.componentIdentity] }),
  ],
);
