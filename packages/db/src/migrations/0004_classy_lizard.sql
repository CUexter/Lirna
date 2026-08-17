CREATE TABLE "sep_source_state_metadata" (
	"source_state_id" uuid PRIMARY KEY NOT NULL,
	"admission_preview_id" uuid NOT NULL,
	"observation_key" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb NOT NULL,
	"publisher" text NOT NULL,
	"publication_history" jsonb NOT NULL,
	CONSTRAINT "sep_source_state_metadata_observation_key_check" CHECK ("sep_source_state_metadata"."observation_key" IN ('submitted', 'recommended-archive'))
);
--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD COLUMN "identity" text;--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD COLUMN "request_count" integer;--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD COLUMN "downloaded_bytes" integer;--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD COLUMN "depth" integer;--> statement-breakpoint
UPDATE "source_state_resources" SET "identity" = 'legacy:' || "id"::text, "request_count" = 1, "downloaded_bytes" = "byte_length", "depth" = 0;--> statement-breakpoint
ALTER TABLE "source_state_resources" ALTER COLUMN "identity" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_resources" ALTER COLUMN "request_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_resources" ALTER COLUMN "downloaded_bytes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_resources" ALTER COLUMN "depth" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ADD CONSTRAINT "sep_source_state_metadata_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sep_source_state_metadata_admission_observation_unique" ON "sep_source_state_metadata" USING btree ("admission_preview_id","observation_key");--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD CONSTRAINT "source_state_resources_request_metrics_check" CHECK ("source_state_resources"."request_count" >= 1 AND "source_state_resources"."downloaded_bytes" >= "source_state_resources"."byte_length");--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD CONSTRAINT "source_state_resources_depth_check" CHECK ("source_state_resources"."depth" >= 0);--> statement-breakpoint
CREATE TRIGGER "sep_source_state_metadata_immutable" BEFORE UPDATE OR DELETE ON "sep_source_state_metadata" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
