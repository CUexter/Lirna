CREATE TABLE "sep_admission_outcomes" (
	"admission_preview_id" uuid NOT NULL,
	"observation_key" text NOT NULL,
	"source_state_id" uuid NOT NULL,
	"disposition" text NOT NULL,
	CONSTRAINT "sep_admission_outcomes_admission_preview_id_observation_key_pk" PRIMARY KEY("admission_preview_id","observation_key"),
	CONSTRAINT "sep_admission_outcomes_observation_key_check" CHECK ("sep_admission_outcomes"."observation_key" IN ('submitted', 'recommended-archive')),
	CONSTRAINT "sep_admission_outcomes_disposition_check" CHECK ("sep_admission_outcomes"."disposition" IN ('created', 'unchanged'))
);
--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ADD COLUMN "diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ADD COLUMN "capture_diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" DISABLE TRIGGER "sep_source_state_metadata_immutable";--> statement-breakpoint
UPDATE "sep_source_state_metadata" AS metadata
SET
	"diagnostics" = COALESCE(preview."diagnostics", '[]'::jsonb),
	"capture_diagnostics" = COALESCE(
		preview."capture_diagnostics",
		'{"budget":"unknown","completeness":"partial","readingReadiness":"degraded","readinessReasons":["Historical capture diagnostics were not recorded."],"unresolvedResources":[],"limits":null,"retryUsed":null}'::jsonb
	)
FROM "sep_admission_previews" AS preview
WHERE preview."id" = metadata."admission_preview_id";--> statement-breakpoint
UPDATE "sep_source_state_metadata"
SET
	"diagnostics" = COALESCE("diagnostics", '[]'::jsonb),
	"capture_diagnostics" = COALESCE(
		"capture_diagnostics",
		'{"budget":"unknown","completeness":"partial","readingReadiness":"degraded","readinessReasons":["Historical capture diagnostics were not recorded."],"unresolvedResources":[],"limits":null,"retryUsed":null}'::jsonb
	);--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ALTER COLUMN "diagnostics" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ALTER COLUMN "capture_diagnostics" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_source_state_metadata" ENABLE TRIGGER "sep_source_state_metadata_immutable";--> statement-breakpoint
INSERT INTO "sep_admission_outcomes" (
	"admission_preview_id",
	"observation_key",
	"source_state_id",
	"disposition"
)
SELECT
	"admission_preview_id",
	"observation_key",
	"source_state_id",
	'created'
FROM "sep_source_state_metadata";--> statement-breakpoint
ALTER TABLE "sep_admission_outcomes" ADD CONSTRAINT "sep_admission_outcomes_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "sep_admission_outcomes_immutable" BEFORE UPDATE OR DELETE ON "sep_admission_outcomes" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
