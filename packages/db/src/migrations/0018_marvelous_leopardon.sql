CREATE TABLE "research_evidence_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"research_thread_id" uuid NOT NULL,
	"source_state_id" uuid NOT NULL,
	"resolver_version" text NOT NULL,
	"index_version" text NOT NULL,
	"budget" jsonb,
	"consumption" jsonb,
	"candidate_count" integer,
	"reason_codes" jsonb,
	"admitted_count" integer,
	"refused_count" integer,
	"budget_exhausted" boolean,
	"outcome" text NOT NULL,
	"terminal_reason_code" text,
	"latency_bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_evidence_receipts_outcome_check" CHECK ("research_evidence_receipts"."outcome" IN ('successful', 'refused', 'exhausted', 'invalid-answer', 'cancelled', 'provider-failed', 'commit-failed')),
	CONSTRAINT "research_evidence_receipts_latency_check" CHECK ("research_evidence_receipts"."latency_bucket" IN ('under-100ms', '100ms-1s', '1s-5s', 'over-5s'))
);
--> statement-breakpoint
ALTER TABLE "research_evidence_receipts" ADD CONSTRAINT "research_evidence_receipts_research_thread_id_research_threads_id_fk" FOREIGN KEY ("research_thread_id") REFERENCES "public"."research_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence_receipts" ADD CONSTRAINT "research_evidence_receipts_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_evidence_receipts_thread_created_idx" ON "research_evidence_receipts" USING btree ("research_thread_id","created_at");