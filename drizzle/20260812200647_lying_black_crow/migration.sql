CREATE TABLE "source_states" (
	"id" uuid PRIMARY KEY,
	"source_id" uuid NOT NULL,
	"authoritative_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"rights_basis" text NOT NULL,
	"sensitivity_level" text NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY,
	"title" text NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_states" ADD CONSTRAINT "source_states_source_id_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id");
--> statement-breakpoint
CREATE FUNCTION reject_source_state_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'source_states is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER source_states_immutable BEFORE UPDATE OR DELETE ON source_states FOR EACH ROW EXECUTE FUNCTION reject_source_state_mutation();
