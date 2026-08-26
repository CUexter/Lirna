import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { authoredTextColumns } from "./authored-text-columns";
import { sourceStates, sources } from "./sources";

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
    check(
      "annotations_offsets_check",
      sql`${table.normalizedStartOffset} >= 0 AND ${table.normalizedEndOffset} > ${table.normalizedStartOffset}`,
    ),
    check(
      "annotations_kind_check",
      sql`${table.kind} IN ('highlight', 'note')`,
    ),
    check(
      "annotations_offset_basis_check",
      sql`${table.offsetBasis} = 'normalized-derivative-text-v1'`,
    ),
    check(
      "annotations_color_check",
      sql`${table.color} IN ('yellow', 'green', 'blue', 'pink')`,
    ),
    check("annotations_exact_text_check", sql`length(${table.exactText}) > 0`),
  ],
);
