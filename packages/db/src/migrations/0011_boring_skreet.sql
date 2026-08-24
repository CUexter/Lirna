CREATE TABLE "citation_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"derivative_id" uuid NOT NULL,
	"component_identity" text NOT NULL,
	"mention_id" text NOT NULL,
	"bibliography_component_identity" text,
	"bibliography_entry_id" text,
	"publisher_anchor" text,
	"offset_basis" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"exact_text" text NOT NULL,
	"prefix" text NOT NULL,
	"suffix" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"confidence" real,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citation_resolutions_offsets_check" CHECK ("citation_resolutions"."start_offset" >= 0 AND "citation_resolutions"."end_offset" > "citation_resolutions"."start_offset"),
	CONSTRAINT "citation_resolutions_offset_basis_check" CHECK ("citation_resolutions"."offset_basis" = 'normalized-derivative-text-v1'),
	CONSTRAINT "citation_resolutions_action_check" CHECK ("citation_resolutions"."action" IN ('selected', 'cleared')),
	CONSTRAINT "citation_resolutions_method_check" CHECK ("citation_resolutions"."method" IN ('manual', 'inferred')),
	CONSTRAINT "citation_resolutions_target_check" CHECK (("citation_resolutions"."action" = 'selected' AND "citation_resolutions"."bibliography_component_identity" IS NOT NULL AND "citation_resolutions"."bibliography_entry_id" IS NOT NULL) OR ("citation_resolutions"."action" = 'cleared' AND "citation_resolutions"."bibliography_component_identity" IS NULL AND "citation_resolutions"."bibliography_entry_id" IS NULL)),
	CONSTRAINT "citation_resolutions_inference_check" CHECK (("citation_resolutions"."method" = 'manual' AND "citation_resolutions"."confidence" IS NULL AND "citation_resolutions"."reasoning" IS NULL) OR ("citation_resolutions"."method" = 'inferred' AND "citation_resolutions"."action" = 'selected' AND "citation_resolutions"."confidence" BETWEEN 0 AND 1 AND length("citation_resolutions"."reasoning") > 0)),
	CONSTRAINT "citation_resolutions_exact_text_check" CHECK (length("citation_resolutions"."exact_text") > 0)
);
--> statement-breakpoint
ALTER TABLE "citation_resolutions" ADD CONSTRAINT "citation_resolution_state_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_resolutions" ADD CONSTRAINT "citation_resolution_derivative_fk" FOREIGN KEY ("derivative_id") REFERENCES "public"."source_state_derivatives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citation_resolutions_source_state_component_idx" ON "citation_resolutions" USING btree ("source_state_id","component_identity","mention_id","created_at");