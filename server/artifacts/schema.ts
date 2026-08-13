import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ArtifactReference, ProvenanceOrigin } from "./artifact-registry.js";
import type { RightsBasis, SensitivityLevel } from "./source-handling-policy.js";

export const artifacts = pgTable(
  "artifacts",
  {
    hash: text().primaryKey(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sensitivity: text().$type<SensitivityLevel>().notNull(),
    rightsBasis: text("rights_basis").$type<RightsBasis>().notNull(),
    provenanceOrigin: text("provenance_origin").$type<ProvenanceOrigin>().notNull(),
    provenanceDetail: text("provenance_detail").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("artifacts_byte_size_check", sql`${table.byteSize} >= 0`)],
);

export const artifactReferences = pgTable(
  "artifact_references",
  {
    hash: text()
      .notNull()
      .references(() => artifacts.hash),
    kind: text().$type<ArtifactReference["kind"]>().notNull(),
    targetId: text("target_id").notNull(),
    locator: text().default("").notNull(),
  },
  (table) => [primaryKey({ columns: [table.hash, table.kind, table.targetId, table.locator] })],
);

export const artifactRegistrations = pgTable(
  "artifact_registrations",
  {
    id: uuid().primaryKey(),
    hash: text()
      .notNull()
      .references(() => artifacts.hash),
    sensitivity: text().$type<SensitivityLevel>().notNull(),
    rightsBasis: text("rights_basis").$type<RightsBasis>().notNull(),
    provenanceOrigin: text("provenance_origin").$type<ProvenanceOrigin>().notNull(),
    provenanceDetail: text("provenance_detail").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("artifact_registrations_observation").on(
      table.hash,
      table.sensitivity,
      table.rightsBasis,
      table.provenanceOrigin,
      table.provenanceDetail,
    ),
  ],
);
