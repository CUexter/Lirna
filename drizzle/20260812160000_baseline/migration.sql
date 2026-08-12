CREATE TABLE "application_operations" ("id" uuid PRIMARY KEY, "kind" text NOT NULL, "input" text NOT NULL, "status" text NOT NULL, "attempts" integer DEFAULT 0 NOT NULL, "lease_until" timestamptz, "result" jsonb, "artifact_hash" text, "error" text, "requested_at" timestamptz DEFAULT now() NOT NULL, "completed_at" timestamptz, CONSTRAINT "application_operations_status_check" CHECK ("status" IN ('queued', 'processing', 'completed', 'failed')));
--> statement-breakpoint
CREATE TABLE "synthetic_records" ("id" uuid PRIMARY KEY, "owner_module" text NOT NULL, "revision" integer NOT NULL CHECK ("revision" >= 1), "state" jsonb NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "synthetic_record_revisions" ("record_id" uuid NOT NULL REFERENCES "synthetic_records" ("id"), "revision" integer NOT NULL CHECK ("revision" >= 1), "owner_module" text NOT NULL, "state" jsonb NOT NULL, "note" text NOT NULL, "recorded_at" timestamptz DEFAULT now() NOT NULL, PRIMARY KEY ("record_id", "revision"));
--> statement-breakpoint
CREATE TABLE "artifacts" ("hash" text PRIMARY KEY, "byte_size" bigint NOT NULL CHECK ("byte_size" >= 0), "sensitivity" text NOT NULL, "rights_basis" text NOT NULL, "provenance_origin" text NOT NULL, "provenance_detail" text NOT NULL, "registered_at" timestamptz DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "artifact_references" ("hash" text NOT NULL REFERENCES "artifacts" ("hash"), "kind" text NOT NULL, "target_id" text NOT NULL, "locator" text, PRIMARY KEY ("hash", "kind", "target_id"));
--> statement-breakpoint
CREATE TABLE "domain_outbox" ("id" uuid PRIMARY KEY, "record_id" uuid NOT NULL, "owner_module" text NOT NULL, "event_type" text NOT NULL, "revision" integer NOT NULL CHECK ("revision" >= 1), "payload" jsonb NOT NULL, "occurred_at" timestamptz DEFAULT now() NOT NULL, "published_at" timestamptz);
--> statement-breakpoint
CREATE INDEX "domain_outbox_unpublished" ON "domain_outbox" ("occurred_at") WHERE "published_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "workflow_definitions" ("workflow_id" text NOT NULL, "version" integer NOT NULL CHECK ("version" >= 1), "definition" jsonb NOT NULL, "declared_at" timestamptz DEFAULT now() NOT NULL, PRIMARY KEY ("workflow_id", "version"));
--> statement-breakpoint
CREATE TABLE "workflow_runs" ("id" uuid PRIMARY KEY, "workflow_id" text NOT NULL, "workflow_version" integer NOT NULL, "status" text NOT NULL CONSTRAINT "workflow_runs_status_check" CHECK ("status" IN ('running', 'paused', 'completed', 'failed')), "current_step" integer NOT NULL CHECK ("current_step" >= 0), "input" jsonb NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL, FOREIGN KEY ("workflow_id", "workflow_version") REFERENCES "workflow_definitions" ("workflow_id", "version"));
--> statement-breakpoint
CREATE TABLE "workflow_routing_decisions" ("run_id" uuid NOT NULL REFERENCES "workflow_runs" ("id"), "step_index" integer NOT NULL CHECK ("step_index" >= 0), "decision" jsonb NOT NULL, "recorded_at" timestamptz DEFAULT now() NOT NULL, PRIMARY KEY ("run_id", "step_index"));
--> statement-breakpoint
CREATE TABLE "workflow_step_attempts" ("run_id" uuid NOT NULL REFERENCES "workflow_runs" ("id"), "step_index" integer NOT NULL CHECK ("step_index" >= 0), "attempt" integer NOT NULL CHECK ("attempt" >= 1), "step_id" text NOT NULL, "lease_id" uuid NOT NULL, "lease_until" timestamptz NOT NULL, "status" text NOT NULL CHECK ("status" IN ('leased', 'committed', 'expired')), "artifact_hash" text REFERENCES "artifacts" ("hash"), "leased_at" timestamptz DEFAULT now() NOT NULL, "committed_at" timestamptz, PRIMARY KEY ("run_id", "step_index", "attempt"));
--> statement-breakpoint
CREATE INDEX "workflow_step_attempts_active" ON "workflow_step_attempts" ("run_id", "step_index", "status", "lease_until");
--> statement-breakpoint
CREATE TABLE "workflow_human_gates" ("run_id" uuid NOT NULL REFERENCES "workflow_runs" ("id"), "step_index" integer NOT NULL CHECK ("step_index" >= 0), "step_id" text NOT NULL, "status" text NOT NULL CHECK ("status" IN ('pending', 'satisfied', 'rejected')), "decision_hash" text REFERENCES "artifacts" ("hash"), "raised_at" timestamptz DEFAULT now() NOT NULL, "decided_at" timestamptz, PRIMARY KEY ("run_id", "step_index"));
--> statement-breakpoint
CREATE FUNCTION reject_artifact_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'artifacts is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER artifact_identity_immutable BEFORE UPDATE OR DELETE ON artifacts FOR EACH ROW EXECUTE FUNCTION reject_artifact_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_synthetic_history_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic_record_revisions is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER synthetic_history_immutable BEFORE UPDATE OR DELETE ON synthetic_record_revisions FOR EACH ROW EXECUTE FUNCTION reject_synthetic_history_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_workflow_definition_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'workflow_definitions is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER workflow_definition_immutable BEFORE UPDATE OR DELETE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION reject_workflow_definition_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_workflow_routing_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'workflow_routing_decisions is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER workflow_routing_immutable BEFORE UPDATE OR DELETE ON workflow_routing_decisions FOR EACH ROW EXECUTE FUNCTION reject_workflow_routing_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_workflow_checkpoint_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'workflow_step_attempts committed rows are immutable'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER workflow_checkpoint_immutable BEFORE UPDATE OR DELETE ON workflow_step_attempts FOR EACH ROW WHEN (OLD.status = 'committed') EXECUTE FUNCTION reject_workflow_checkpoint_mutation();
