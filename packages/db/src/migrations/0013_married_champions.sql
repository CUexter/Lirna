ALTER TABLE "source_state_derivative_activations" ADD COLUMN "actor_id" text DEFAULT 'system:admission' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD COLUMN "reason" text DEFAULT 'Initial validated derivative' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD COLUMN "consequences" jsonb DEFAULT '{"semantic":{"changedComponents":[]},"structure":[],"diagnostics":{"added":[],"removed":[]},"relocations":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_derivatives" ADD COLUMN "generation" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_state_derivatives" DISABLE TRIGGER "source_state_derivatives_immutable";--> statement-breakpoint
UPDATE "source_state_derivatives"
SET "generation" = jsonb_build_object(
  'version', 1,
  'parser', COALESCE("payload"->'provenance'->'parser', '{"id":"parse5","version":"7.3.0"}'::jsonb),
  'renderer', '{"id":"lirna-reading-react","version":"1"}'::jsonb,
  'inputResourceHashes', COALESCE("payload"->'provenance'->'inputResourceHashes', '[]'::jsonb)
);--> statement-breakpoint
ALTER TABLE "source_state_derivatives" ENABLE TRIGGER "source_state_derivatives_immutable";--> statement-breakpoint
ALTER TABLE "source_state_derivatives" ALTER COLUMN "generation" DROP DEFAULT;
