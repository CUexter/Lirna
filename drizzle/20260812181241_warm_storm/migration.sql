CREATE TABLE "artifact_registrations" (
	"id" uuid PRIMARY KEY,
	"hash" text NOT NULL,
	"sensitivity" text NOT NULL,
	"rights_basis" text NOT NULL,
	"provenance_origin" text NOT NULL,
	"provenance_detail" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
UPDATE "artifact_references" SET "locator" = '' WHERE "locator" IS NULL;
--> statement-breakpoint
ALTER TABLE "artifact_references" ALTER COLUMN "locator" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "artifact_references" ALTER COLUMN "locator" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_registrations_observation" ON "artifact_registrations" ("hash","sensitivity","rights_basis","provenance_origin","provenance_detail");--> statement-breakpoint
ALTER TABLE "artifact_registrations" ADD CONSTRAINT "artifact_registrations_hash_artifacts_hash_fkey" FOREIGN KEY ("hash") REFERENCES "artifacts"("hash");--> statement-breakpoint
ALTER TABLE "artifact_references" DROP CONSTRAINT "artifact_references_pkey";--> statement-breakpoint
ALTER TABLE "artifact_references" ADD PRIMARY KEY ("hash","kind","target_id","locator");
--> statement-breakpoint
INSERT INTO "artifact_registrations" (
	"id", "hash", "sensitivity", "rights_basis", "provenance_origin", "provenance_detail", "registered_at"
)
SELECT gen_random_uuid(), "hash", "sensitivity", "rights_basis", "provenance_origin", "provenance_detail", "registered_at"
FROM "artifacts";
--> statement-breakpoint
CREATE FUNCTION reject_artifact_registration_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'artifact_registrations is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER artifact_registration_immutable BEFORE UPDATE OR DELETE ON artifact_registrations FOR EACH ROW EXECUTE FUNCTION reject_artifact_registration_mutation();
