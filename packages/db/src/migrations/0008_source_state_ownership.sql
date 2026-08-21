ALTER TABLE "source_states" ADD CONSTRAINT "source_states_id_source_unique" UNIQUE("id","source_id");
--> statement-breakpoint
ALTER TABLE "annotations" DROP CONSTRAINT "annotations_source_state_id_source_states_id_fk";
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_source_state_source_fk" FOREIGN KEY ("source_state_id","source_id") REFERENCES "public"."source_states"("id","source_id") ON DELETE cascade ON UPDATE no action;
