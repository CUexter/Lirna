ALTER TABLE "sep_admission_previews" ADD COLUMN "publisher" text;--> statement-breakpoint
UPDATE "sep_admission_previews" SET "publisher" = 'Metaphysics Research Lab, Stanford University' WHERE "publisher" IS NULL;--> statement-breakpoint
ALTER TABLE "sep_admission_previews" ALTER COLUMN "publisher" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD COLUMN "request_count" integer;--> statement-breakpoint
UPDATE "sep_preview_resources" SET "request_count" = 1 WHERE "request_count" IS NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ALTER COLUMN "request_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD COLUMN "downloaded_bytes" integer;--> statement-breakpoint
UPDATE "sep_preview_resources" SET "downloaded_bytes" = "byte_length" WHERE "downloaded_bytes" IS NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ALTER COLUMN "downloaded_bytes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD CONSTRAINT "sep_preview_resources_request_metrics_check" CHECK ("sep_preview_resources"."request_count" >= 1 AND "sep_preview_resources"."downloaded_bytes" >= "sep_preview_resources"."byte_length");
