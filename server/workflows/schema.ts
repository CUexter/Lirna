import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { artifacts } from "../artifacts/schema.js";
import type { RoutingDecision } from "./executor-router.js";
import type { AttemptStatus, GateStatus, RunStatus } from "./workflow-run-repository.js";
import type { WorkflowDefinition } from "./workflow-definition.js";

export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    workflowId: text("workflow_id").notNull(),
    version: integer().notNull(),
    definition: jsonb().$type<WorkflowDefinition>().notNull(),
    declaredAt: timestamp("declared_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowId, table.version] }),
    check("workflow_definitions_version_check", sql`${table.version} >= 1`),
  ],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid().primaryKey(),
    workflowId: text("workflow_id").notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    status: text().$type<RunStatus>().notNull(),
    currentStep: integer("current_step").notNull(),
    input: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workflowId, table.workflowVersion],
      foreignColumns: [workflowDefinitions.workflowId, workflowDefinitions.version],
    }),
    check("workflow_runs_status_check", sql`${table.status} in ('running', 'paused', 'completed', 'failed')`),
    check("workflow_runs_current_step_check", sql`${table.currentStep} >= 0`),
  ],
);

export const workflowRoutingDecisions = pgTable(
  "workflow_routing_decisions",
  {
    runId: uuid("run_id").notNull().references(() => workflowRuns.id),
    stepIndex: integer("step_index").notNull(),
    decision: jsonb().$type<RoutingDecision>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.stepIndex] }),
    check("workflow_routing_decisions_step_index_check", sql`${table.stepIndex} >= 0`),
  ],
);

export const workflowStepAttempts = pgTable(
  "workflow_step_attempts",
  {
    runId: uuid("run_id").notNull().references(() => workflowRuns.id),
    stepIndex: integer("step_index").notNull(),
    attempt: integer().notNull(),
    stepId: text("step_id").notNull(),
    leaseId: uuid("lease_id").notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
    status: text().$type<AttemptStatus>().notNull(),
    artifactHash: text("artifact_hash").references(() => artifacts.hash),
    leasedAt: timestamp("leased_at", { withTimezone: true }).defaultNow().notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.stepIndex, table.attempt] }),
    check("workflow_step_attempts_step_index_check", sql`${table.stepIndex} >= 0`),
    check("workflow_step_attempts_attempt_check", sql`${table.attempt} >= 1`),
    check("workflow_step_attempts_status_check", sql`${table.status} in ('leased', 'committed', 'expired')`),
    index("workflow_step_attempts_active").on(
      table.runId,
      table.stepIndex,
      table.status,
      table.leaseUntil,
    ),
  ],
);

export const workflowHumanGates = pgTable(
  "workflow_human_gates",
  {
    runId: uuid("run_id").notNull().references(() => workflowRuns.id),
    stepIndex: integer("step_index").notNull(),
    stepId: text("step_id").notNull(),
    status: text().$type<GateStatus>().notNull(),
    decisionHash: text("decision_hash").references(() => artifacts.hash),
    raisedAt: timestamp("raised_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.stepIndex] }),
    check("workflow_human_gates_step_index_check", sql`${table.stepIndex} >= 0`),
    check("workflow_human_gates_status_check", sql`${table.status} in ('pending', 'satisfied', 'rejected')`),
  ],
);
