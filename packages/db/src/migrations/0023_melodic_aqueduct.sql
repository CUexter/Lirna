CREATE TABLE "research_thread_forks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creation_id" uuid NOT NULL,
	"source_thread_id" uuid NOT NULL,
	"source_answer_message_id" uuid NOT NULL,
	"new_thread_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_thread_forks_creation_id_unique" UNIQUE("creation_id"),
	CONSTRAINT "research_thread_forks_new_thread_id_unique" UNIQUE("new_thread_id"),
	CONSTRAINT "research_thread_forks_distinct_threads_check" CHECK ("research_thread_forks"."source_thread_id" <> "research_thread_forks"."new_thread_id")
);
--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD COLUMN "origin_message_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "research_thread_messages_thread_id_idx" ON "research_thread_messages" USING btree ("research_thread_id","id");--> statement-breakpoint
ALTER TABLE "research_thread_forks" ADD CONSTRAINT "research_thread_forks_source_thread_id_research_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."research_threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_thread_forks" ADD CONSTRAINT "research_thread_forks_new_thread_id_research_threads_id_fk" FOREIGN KEY ("new_thread_id") REFERENCES "public"."research_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_thread_forks" ADD CONSTRAINT "research_thread_forks_source_answer_fk" FOREIGN KEY ("source_thread_id","source_answer_message_id") REFERENCES "public"."research_thread_messages"("research_thread_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_thread_forks_source_idx" ON "research_thread_forks" USING btree ("source_thread_id","source_answer_message_id","created_at");--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD CONSTRAINT "research_thread_messages_origin_fk" FOREIGN KEY ("origin_message_id") REFERENCES "public"."research_thread_messages"("id") ON DELETE restrict ON UPDATE no action;
