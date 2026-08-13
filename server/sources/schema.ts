import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const sources = pgTable("sources", {
  id: uuid().primaryKey(),
  title: text().notNull(),
  admittedAt: timestamp("admitted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sourceStates = pgTable(
  "source_states",
  {
    id: uuid().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    authoritativeText: text("authoritative_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    rightsBasis: text("rights_basis").notNull(),
    sensitivityLevel: text("sensitivity_level").notNull(),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "source_states_rights_basis_check",
      sql`${table.rightsBasis} IN ('owned', 'lawfully-acquired', 'publicly-accessible', 'explicitly-licensed', 'reference-only', 'inaccessible')`,
    ),
    check(
      "source_states_sensitivity_level_check",
      sql`${table.sensitivityLevel} IN ('ordinary-cloud', 'restricted-cloud', 'local-only')`,
    ),
  ],
);
