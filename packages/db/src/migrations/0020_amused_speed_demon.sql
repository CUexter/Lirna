ALTER TABLE "research_evidence_receipts" ADD COLUMN "question_message_id" uuid;--> statement-breakpoint
ALTER TABLE "research_evidence_receipts" ADD COLUMN "attempted_answer_message_id" uuid;--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD COLUMN "model" text;