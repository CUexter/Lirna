import type { Buffer } from "node:buffer";

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  customType,
  integer,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export function capturedResourceColumns() {
  return {
    identity: text("identity").notNull(),
    role: text("role").notNull(),
    requestedUrl: text("requested_url").notNull(),
    finalUrl: text("final_url").notNull(),
    status: integer("status").notNull(),
    mediaType: text("media_type").notNull(),
    charset: text("charset"),
    contentEncoding: text("content_encoding"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    selectedHeaders: jsonb("selected_headers")
      .$type<Record<string, string>>()
      .notNull(),
    requestCount: integer("request_count").notNull(),
    downloadedBytes: integer("downloaded_bytes").notNull(),
    byteLength: integer("byte_length").notNull(),
    sha256: text("sha256").notNull(),
    discoveryEdge: text("discovery_edge").notNull(),
    depth: integer("depth").notNull(),
    body: bytea("body").notNull(),
  };
}

export const policyChecks = <
  T extends {
    rightsBasis: AnyPgColumn;
    sensitivityLevel: AnyPgColumn;
  },
>(
  table: T,
  prefix: string,
) => [
  check(
    `${prefix}_rights_basis_check`,
    sql`${table.rightsBasis} IN ('owned', 'lawfully-acquired', 'publicly-accessible', 'explicitly-licensed', 'reference-only', 'inaccessible')`,
  ),
  check(
    `${prefix}_sensitivity_level_check`,
    sql`${table.sensitivityLevel} IN ('ordinary-cloud', 'restricted-cloud', 'local-only')`,
  ),
];
