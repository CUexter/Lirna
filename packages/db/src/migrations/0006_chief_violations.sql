CREATE TABLE "reading_positions" (
	"source_state_id" uuid PRIMARY KEY NOT NULL,
	"component_identity" text NOT NULL,
	"component_label" text NOT NULL,
	"scroll_top" integer NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_positions" ADD CONSTRAINT "reading_positions_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE cascade ON UPDATE no action;