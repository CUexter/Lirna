import { type SQLWrapper, sql } from "drizzle-orm";
import { check, integer, text, timestamp } from "drizzle-orm/pg-core";

export const persistedAuthoredTargetOffsetBases = [
  "normalized-derivative-text-v1",
] as const;

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

export function authoredTextChecks(
  table: {
    offsetBasis: SQLWrapper;
    normalizedStartOffset: SQLWrapper;
    normalizedEndOffset: SQLWrapper;
    exactText: SQLWrapper;
  },
  name: string,
) {
  return [
    check(
      `${name}_offsets_check`,
      sql`${table.normalizedStartOffset} >= 0 AND ${table.normalizedEndOffset} > ${table.normalizedStartOffset}`,
    ),
    check(
      `${name}_offset_basis_check`,
      inVocabulary(table.offsetBasis, persistedAuthoredTargetOffsetBases),
    ),
    check(`${name}_exact_text_check`, sql`length(${table.exactText}) > 0`),
  ];
}

export function inVocabulary(column: SQLWrapper, values: readonly string[]) {
  const literals = values.map((value) =>
    sql.raw(`'${value.replaceAll("'", "''")}'`),
  );
  return sql`${column} IN (${sql.join(literals, sql`, `)})`;
}
