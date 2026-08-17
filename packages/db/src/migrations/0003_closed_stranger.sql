UPDATE "sep_admission_previews"
SET "capture_diagnostics" = jsonb_build_object(
  'budget', 'standard',
  'completeness', 'partial',
  'readingReadiness', 'degraded',
  'readinessReasons', jsonb_build_array('This preview predates recursive bundle discovery and must be retried'),
  'unresolvedResources', '[]'::jsonb,
  'limits', jsonb_build_object(
    'maxComponents', 64,
    'maxAssets', 256,
    'maxResourceBytes', 52428800,
    'maxTotalBytes', 262144000,
    'maxDepth', 8,
    'maxRedirects', 5,
    'timeoutMilliseconds', 15000,
    'maxConcurrency', 4
  ),
  'retryUsed', false
)
WHERE NOT ("capture_diagnostics" ? 'completeness');--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD COLUMN "identity" text;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD COLUMN "depth" integer;--> statement-breakpoint
UPDATE "sep_preview_resources"
SET
  "identity" = CASE
    WHEN "role" = 'main' AND "final_url" ~ '/archives/[^/]+/entries/'
      THEN substring("final_url" from '/archives/([^/]+)/entries/') || ':/'
    WHEN "role" = 'main' THEN 'active:/'
    WHEN "role" = 'citation-information' THEN 'citation-information:legacy'
    ELSE 'legacy:' || "id"::text
  END,
  "depth" = 0
WHERE "identity" IS NULL OR "depth" IS NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ALTER COLUMN "identity" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ALTER COLUMN "depth" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sep_preview_resources_identity_unique" ON "sep_preview_resources" USING btree ("preview_id","observation_key","identity");--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD CONSTRAINT "sep_preview_resources_depth_check" CHECK ("sep_preview_resources"."depth" >= 0);
