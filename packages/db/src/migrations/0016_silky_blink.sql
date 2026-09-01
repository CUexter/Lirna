CREATE TABLE "research_thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_thread_id" uuid NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "research_thread_messages_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role" text NOT NULL,
	"content" text NOT NULL,
	"selected_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_thread_messages_role_check" CHECK ("research_thread_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "research_thread_messages_content_check" CHECK (length("research_thread_messages"."content") > 0)
);
--> statement-breakpoint
CREATE TABLE "research_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"component_identity" text NOT NULL,
	"component_label" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD CONSTRAINT "research_thread_messages_research_thread_id_research_threads_id_fk" FOREIGN KEY ("research_thread_id") REFERENCES "public"."research_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_threads" ADD CONSTRAINT "research_threads_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_thread_messages_thread_sequence_idx" ON "research_thread_messages" USING btree ("research_thread_id","sequence");--> statement-breakpoint
CREATE INDEX "research_threads_scope_updated_idx" ON "research_threads" USING btree ("source_state_id","component_identity","updated_at");