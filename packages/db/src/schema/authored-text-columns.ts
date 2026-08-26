import { integer, text, timestamp } from "drizzle-orm/pg-core";

export function authoredTextColumns() {
  return {
    publisherAnchor: text("publisher_anchor"),
    offsetBasis: text("offset_basis").notNull(),
    normalizedStartOffset: integer("start_offset").notNull(),
    normalizedEndOffset: integer("end_offset").notNull(),
    exactText: text("exact_text").notNull(),
    prefix: text("prefix").notNull(),
    suffix: text("suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}
