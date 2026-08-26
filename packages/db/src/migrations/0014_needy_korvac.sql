DROP INDEX "source_state_derivative_activations_current_idx";--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD COLUMN "sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" DISABLE TRIGGER "source_state_derivative_activations_immutable";--> statement-breakpoint
WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "source_state_id", "kind"
			ORDER BY "activated_at", "id"
		)::integer AS "sequence"
	FROM "source_state_derivative_activations"
)
UPDATE "source_state_derivative_activations" AS activation
SET "sequence" = ranked."sequence"
FROM ranked
WHERE activation."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ENABLE TRIGGER "source_state_derivative_activations_immutable";--> statement-breakpoint
CREATE UNIQUE INDEX "source_state_derivative_activations_sequence_uidx" ON "source_state_derivative_activations" USING btree ("source_state_id","kind","sequence");--> statement-breakpoint
CREATE INDEX "source_state_derivative_activations_current_idx" ON "source_state_derivative_activations" USING btree ("source_state_id","kind","sequence");--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD CONSTRAINT "source_state_derivative_activations_sequence_check" CHECK ("source_state_derivative_activations"."sequence" >= 1);
