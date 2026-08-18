CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"component_identity" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"exact_text" text NOT NULL,
	"color" text NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotations_offsets_check" CHECK ("annotations"."start_offset" >= 0 AND "annotations"."end_offset" > "annotations"."start_offset"),
	CONSTRAINT "annotations_color_check" CHECK ("annotations"."color" IN ('yellow', 'green', 'blue', 'pink')),
	CONSTRAINT "annotations_exact_text_check" CHECK (length("annotations"."exact_text") > 0)
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_source_state_component_idx" ON "annotations" USING btree ("source_state_id","component_identity","start_offset");