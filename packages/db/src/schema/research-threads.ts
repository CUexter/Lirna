import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  type PgTableExtraConfigValue,
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
    selectedLeafMessageId: uuid("selected_leaf_message_id"),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.selectedLeafMessageId],
      foreignColumns: [researchThreadMessages.id as AnyPgColumn],
      name: "research_threads_selected_leaf_fk",
    }).onDelete("set null"),
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
    researchThreadId: uuid("research_thread_id").notNull(),
    parentMessageId: uuid("parent_message_id"),
    sequence: integer("sequence").generatedAlwaysAsIdentity().notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    selectedText: text("selected_text"),
    temporaryEvidence:
      jsonb("temporary_evidence").$type<
        Array<{ filename: string; mediaType: string }>
      >(),
    model: text("model"),
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
  (table): PgTableExtraConfigValue[] => [
    index("research_thread_messages_thread_sequence_idx").on(
      table.researchThreadId,
      table.sequence,
    ),
    index("research_thread_messages_parent_sequence_idx").on(
      table.researchThreadId,
      table.parentMessageId,
      table.sequence,
    ),
    foreignKey({
      columns: [table.researchThreadId],
      foreignColumns: [researchThreads.id],
      name: "research_thread_messages_thread_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parentMessageId],
      foreignColumns: [table.id],
      name: "research_thread_messages_parent_fk",
    }).onDelete("restrict"),
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
    researchThreadId: uuid("research_thread_id").notNull(),
    questionMessageId: uuid("question_message_id"),
    attemptedAnswerMessageId: uuid("attempted_answer_message_id"),
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
    foreignKey({
      columns: [table.researchThreadId],
      foreignColumns: [researchThreads.id],
      name: "research_evidence_receipts_thread_fk",
    }).onDelete("cascade"),
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
