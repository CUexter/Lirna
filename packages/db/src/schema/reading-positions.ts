import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { sourceStates } from "./sources";

export const readingPositions = pgTable("reading_positions", {
  sourceStateId: uuid("source_state_id")
    .primaryKey()
    .references(() => sourceStates.id, { onDelete: "cascade" }),
  componentIdentity: text("component_identity").notNull(),
  componentLabel: text("component_label").notNull(),
  scrollTop: integer("scroll_top").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
});
