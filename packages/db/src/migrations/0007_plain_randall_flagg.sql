ALTER TABLE "reading_positions" DROP CONSTRAINT "reading_positions_pkey";--> statement-breakpoint
ALTER TABLE "reading_positions" ADD CONSTRAINT "reading_positions_source_state_id_component_identity_pk" PRIMARY KEY("source_state_id","component_identity");--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "publisher_anchor" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "offset_basis" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "suffix" text;--> statement-breakpoint
UPDATE "annotations" SET
  "source_id" = "source_states"."source_id",
  "kind" = CASE WHEN NULLIF(btrim("annotations"."body"), '') IS NULL THEN 'highlight' ELSE 'note' END
FROM "source_states"
WHERE "annotations"."source_state_id" = "source_states"."id";--> statement-breakpoint
CREATE FUNCTION pg_temp.utf16_length("value" text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(sum(
    CASE WHEN ascii("character") > 65535 THEN 2 ELSE 1 END
  ), 0)::integer
  FROM regexp_split_to_table("value", '') AS "character"
$$;--> statement-breakpoint
WITH RECURSIVE "active_components" AS (
  SELECT
    "annotations"."id",
    "annotations"."start_offset" AS "old_start_offset",
    "annotations"."exact_text",
    "component"."value"->>'plainText' AS "plain_text"
  FROM "annotations"
  JOIN LATERAL (
    SELECT "source_state_derivatives"."payload"
    FROM "source_state_derivative_activations"
    INNER JOIN "source_state_derivatives"
      ON "source_state_derivatives"."id" = "source_state_derivative_activations"."derivative_id"
    WHERE
      "source_state_derivative_activations"."source_state_id" = "annotations"."source_state_id"
      AND "source_state_derivative_activations"."kind" = 'sep-reading-v1'
      AND "source_state_derivatives"."source_state_id" = "annotations"."source_state_id"
      AND "source_state_derivatives"."kind" = 'sep-reading-v1'
      AND "source_state_derivatives"."valid" = true
    ORDER BY "source_state_derivative_activations"."activated_at" DESC
    LIMIT 1
  ) AS "active_derivative" ON true
  JOIN LATERAL jsonb_array_elements("active_derivative"."payload"->'components') AS "component"("value")
    ON "component"."value"->>'identity' = "annotations"."component_identity"
), "occurrences" AS (
  SELECT
    *,
    strpos("plain_text", "exact_text") AS "character_position"
  FROM "active_components"
  UNION ALL
  SELECT
    "occurrences"."id",
    "occurrences"."old_start_offset",
    "occurrences"."exact_text",
    "occurrences"."plain_text",
    "occurrences"."character_position" + char_length("occurrences"."exact_text") + "next"."relative_position" - 1
  FROM "occurrences"
  CROSS JOIN LATERAL (
    SELECT strpos(
      substring(
        "occurrences"."plain_text"
        FROM "occurrences"."character_position" + char_length("occurrences"."exact_text")
      ),
      "occurrences"."exact_text"
    ) AS "relative_position"
  ) AS "next"
  WHERE "occurrences"."character_position" > 0 AND "next"."relative_position" > 0
), "positioned" AS (
  SELECT
    *,
    pg_temp.utf16_length(
      substring("plain_text" FROM 1 FOR "character_position" - 1)
    ) AS "start_offset",
    pg_temp.utf16_length("exact_text") AS "exact_length",
    count(*) OVER (PARTITION BY "id") AS "occurrence_count"
  FROM "occurrences"
  WHERE "character_position" > 0
), "normalized" AS (
  SELECT *
  FROM "positioned"
  WHERE "start_offset" = "old_start_offset" OR "occurrence_count" = 1
)
UPDATE "annotations" SET
  "start_offset" = "normalized"."start_offset",
  "end_offset" = "normalized"."start_offset" + "normalized"."exact_length",
  "offset_basis" = 'normalized-derivative-text-v1',
  "prefix" = (
    SELECT substring(
      "normalized"."plain_text"
      FROM "prefix_start"
      FOR "normalized"."character_position" - "prefix_start"
    )
    FROM generate_series(
      GREATEST(1, "normalized"."character_position" - 32),
      "normalized"."character_position"
    ) AS "prefix_start"
    WHERE pg_temp.utf16_length(substring(
      "normalized"."plain_text"
      FROM "prefix_start"
      FOR "normalized"."character_position" - "prefix_start"
    )) <= 32
    ORDER BY pg_temp.utf16_length(substring(
      "normalized"."plain_text"
      FROM "prefix_start"
      FOR "normalized"."character_position" - "prefix_start"
    )) DESC
    LIMIT 1
  ),
  "suffix" = (
    SELECT substring(
      "normalized"."plain_text"
      FROM "normalized"."character_position" + char_length("normalized"."exact_text")
      FOR "suffix_length"
    )
    FROM generate_series(0, 32) AS "suffix_length"
    WHERE pg_temp.utf16_length(substring(
      "normalized"."plain_text"
      FROM "normalized"."character_position" + char_length("normalized"."exact_text")
      FOR "suffix_length"
    )) <= 32
    ORDER BY pg_temp.utf16_length(substring(
      "normalized"."plain_text"
      FROM "normalized"."character_position" + char_length("normalized"."exact_text")
      FOR "suffix_length"
    )) DESC, "suffix_length" DESC
    LIMIT 1
  )
FROM "normalized"
WHERE "annotations"."id" = "normalized"."id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "annotations" WHERE "offset_basis" IS NULL) THEN
    RAISE EXCEPTION 'Cannot safely normalize one or more legacy annotation anchors';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "offset_basis" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "suffix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_kind_check" CHECK ("annotations"."kind" IN ('highlight', 'note'));--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_offset_basis_check" CHECK ("annotations"."offset_basis" = 'normalized-derivative-text-v1');
