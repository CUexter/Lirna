import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { sourceStates } from "./sources";

export const researchThreads = pgTable(
  "research_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id, { onDelete: "cascade" }),
    componentIdentity: text("component_identity").notNull(),
    componentLabel: text("component_label").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("research_threads_scope_updated_idx").on(
      table.sourceStateId,
      table.componentIdentity,
      table.updatedAt,
    ),
  ],
);

export const researchThreadMessages = pgTable(
  "research_thread_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    researchThreadId: uuid("research_thread_id")
      .notNull()
      .references(() => researchThreads.id, { onDelete: "cascade" }),
    sequence: integer("sequence").generatedAlwaysAsIdentity().notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    selectedText: text("selected_text"),
    references:
      jsonb("references").$type<
        Array<{
          id?: string;
          componentIdentity: string;
          componentLabel: string;
          occurrences?: Array<{
            answerTarget: {
              startOffset: number;
              endOffset: number;
            };
            id: string;
            presentation: "passing" | "quote";
            relation: "supports" | "qualifies" | "conflicts" | "background";
            referenceId: string;
          }>;
          selection: {
            offsetBasis: "normalized-derivative-text-v1";
            normalizedStartOffset: number;
            normalizedEndOffset: number;
            exactText: string;
            prefix: string;
            suffix: string;
          };
        }>
      >(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("research_thread_messages_thread_sequence_idx").on(
      table.researchThreadId,
      table.sequence,
    ),
    check(
      "research_thread_messages_role_check",
      sql`${table.role} IN ('user', 'assistant')`,
    ),
    check(
      "research_thread_messages_content_check",
      sql`length(${table.content}) > 0`,
    ),
  ],
);

export const researchEvidenceReceipts = pgTable(
  "research_evidence_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id").notNull(),
    researchThreadId: uuid("research_thread_id")
      .notNull()
      .references(() => researchThreads.id, { onDelete: "cascade" }),
    sourceStateId: uuid("source_state_id")
      .notNull()
      .references(() => sourceStates.id, { onDelete: "cascade" }),
    resolverVersion: text("resolver_version").notNull(),
    indexVersion: text("index_version").notNull(),
    budget: jsonb("budget").$type<{
      maximumDiscoveries: number;
      maximumCandidatesPerDiscovery: number;
      maximumAdmissions: number;
      maximumModelSteps: number;
      maximumTotalEvidenceCharacters: number;
    }>(),
    consumption: jsonb("consumption").$type<{
      discoveries: number;
      candidates: number;
      admissions: number;
      modelSteps: number;
      evidenceCharacters: number;
    }>(),
    candidateCount: integer("candidate_count"),
    reasonCodes: jsonb("reason_codes").$type<string[]>(),
    admittedCount: integer("admitted_count"),
    refusedCount: integer("refused_count"),
    budgetExhausted: boolean("budget_exhausted"),
    outcome: text("outcome").notNull(),
    terminalReasonCode: text("terminal_reason_code"),
    latencyBucket: text("latency_bucket").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("research_evidence_receipts_thread_created_idx").on(
      table.researchThreadId,
      table.createdAt,
    ),
    check(
      "research_evidence_receipts_outcome_check",
      sql`${table.outcome} IN ('successful', 'refused', 'exhausted', 'invalid-answer', 'cancelled', 'provider-failed', 'commit-failed')`,
    ),
    check(
      "research_evidence_receipts_latency_check",
      sql`${table.latencyBucket} IN ('under-100ms', '100ms-1s', '1s-5s', 'over-5s')`,
    ),
  ],
);
