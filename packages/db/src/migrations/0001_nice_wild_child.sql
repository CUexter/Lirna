CREATE TABLE "sep_admission_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"submitted_url" text NOT NULL,
	"recommended_archive_url" text,
	"title" text NOT NULL,
	"authors" jsonb NOT NULL,
	"publication_history" jsonb NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"capture_diagnostics" jsonb NOT NULL,
	"rights_basis" text NOT NULL,
	"sensitivity_level" text NOT NULL,
	"replaces_source_id" uuid,
	"processing_milliseconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sep_admission_previews_stable_key_check" CHECK ("sep_admission_previews"."stable_key" LIKE 'sep:%'),
	CONSTRAINT "sep_admission_previews_processing_time_check" CHECK ("sep_admission_previews"."processing_milliseconds" >= 0),
	CONSTRAINT "sep_admission_previews_expiry_check" CHECK ("sep_admission_previews"."expires_at" > "sep_admission_previews"."created_at"),
	CONSTRAINT "sep_admission_previews_rights_basis_check" CHECK ("sep_admission_previews"."rights_basis" IN ('owned', 'lawfully-acquired', 'publicly-accessible', 'explicitly-licensed', 'reference-only', 'inaccessible')),
	CONSTRAINT "sep_admission_previews_sensitivity_level_check" CHECK ("sep_admission_previews"."sensitivity_level" IN ('ordinary-cloud', 'restricted-cloud', 'local-only'))
);
--> statement-breakpoint
CREATE TABLE "sep_preview_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_id" uuid NOT NULL,
	"observation_key" text NOT NULL,
	"role" text NOT NULL,
	"requested_url" text NOT NULL,
	"final_url" text NOT NULL,
	"status" integer NOT NULL,
	"media_type" text NOT NULL,
	"charset" text,
	"content_encoding" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"selected_headers" jsonb NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"discovery_edge" text NOT NULL,
	"body" "bytea" NOT NULL,
	CONSTRAINT "sep_preview_resources_observation_key_check" CHECK ("sep_preview_resources"."observation_key" IN ('submitted', 'recommended-archive')),
	CONSTRAINT "sep_preview_resources_status_check" CHECK ("sep_preview_resources"."status" BETWEEN 100 AND 599),
	CONSTRAINT "sep_preview_resources_byte_length_check" CHECK ("sep_preview_resources"."byte_length" >= 0 AND octet_length("sep_preview_resources"."body") = "sep_preview_resources"."byte_length"),
	CONSTRAINT "sep_preview_resources_sha256_check" CHECK ("sep_preview_resources"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "source_relations" (
	"source_id" uuid NOT NULL,
	"related_source_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_relations_source_id_related_source_id_kind_pk" PRIMARY KEY("source_id","related_source_id","kind"),
	CONSTRAINT "source_relations_distinct_sources_check" CHECK ("source_relations"."source_id" <> "source_relations"."related_source_id"),
	CONSTRAINT "source_relations_kind_check" CHECK ("source_relations"."kind" IN ('replacement-capture-for'))
);
--> statement-breakpoint
CREATE TABLE "source_state_derivative_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"derivative_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_state_derivatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"previous_derivative_id" uuid,
	"valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_state_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_state_id" uuid NOT NULL,
	"role" text NOT NULL,
	"requested_url" text NOT NULL,
	"final_url" text NOT NULL,
	"status" integer NOT NULL,
	"media_type" text NOT NULL,
	"charset" text,
	"content_encoding" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"selected_headers" jsonb NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"discovery_edge" text NOT NULL,
	"body" "bytea" NOT NULL,
	CONSTRAINT "source_state_resources_status_check" CHECK ("source_state_resources"."status" BETWEEN 100 AND 599),
	CONSTRAINT "source_state_resources_byte_length_check" CHECK ("source_state_resources"."byte_length" >= 0 AND octet_length("source_state_resources"."body") = "source_state_resources"."byte_length"),
	CONSTRAINT "source_state_resources_sha256_check" CHECK ("source_state_resources"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "source_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"adapter_id" text NOT NULL,
	"observation_key" text,
	"canonical_url" text,
	"rights_basis" text NOT NULL,
	"sensitivity_level" text NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_states_sequence_check" CHECK ("source_states"."sequence" >= 0),
	CONSTRAINT "source_states_rights_basis_check" CHECK ("source_states"."rights_basis" IN ('owned', 'lawfully-acquired', 'publicly-accessible', 'explicitly-licensed', 'reference-only', 'inaccessible')),
	CONSTRAINT "source_states_sensitivity_level_check" CHECK ("source_states"."sensitivity_level" IN ('ordinary-cloud', 'restricted-cloud', 'local-only'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"stable_key" text,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sep_admission_previews" ADD CONSTRAINT "sep_admission_previews_replaces_source_id_sources_id_fk" FOREIGN KEY ("replaces_source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sep_preview_resources" ADD CONSTRAINT "sep_preview_resources_preview_id_sep_admission_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."sep_admission_previews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_relations" ADD CONSTRAINT "source_relations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_relations" ADD CONSTRAINT "source_relations_related_source_id_sources_id_fk" FOREIGN KEY ("related_source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD CONSTRAINT "source_state_activations_state_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state_derivative_activations" ADD CONSTRAINT "source_state_activations_derivative_fk" FOREIGN KEY ("derivative_id") REFERENCES "public"."source_state_derivatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state_derivatives" ADD CONSTRAINT "source_state_derivatives_state_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state_derivatives" ADD CONSTRAINT "source_state_derivatives_previous_fk" FOREIGN KEY ("previous_derivative_id") REFERENCES "public"."source_state_derivatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_state_resources" ADD CONSTRAINT "source_state_resources_source_state_id_source_states_id_fk" FOREIGN KEY ("source_state_id") REFERENCES "public"."source_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_states" ADD CONSTRAINT "source_states_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sep_admission_previews_expires_at_idx" ON "sep_admission_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sep_preview_resources_preview_idx" ON "sep_preview_resources" USING btree ("preview_id");--> statement-breakpoint
CREATE INDEX "source_state_derivative_activations_current_idx" ON "source_state_derivative_activations" USING btree ("source_state_id","kind","activated_at");--> statement-breakpoint
CREATE INDEX "source_state_derivatives_state_kind_created_idx" ON "source_state_derivatives" USING btree ("source_state_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "source_state_resources_state_idx" ON "source_state_resources" USING btree ("source_state_id");--> statement-breakpoint
CREATE INDEX "source_state_resources_state_hash_idx" ON "source_state_resources" USING btree ("source_state_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "source_states_source_sequence_unique" ON "source_states" USING btree ("source_id","sequence");--> statement-breakpoint
CREATE INDEX "source_states_source_admitted_at_idx" ON "source_states" USING btree ("source_id","admitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_stable_key_unique" ON "sources" USING btree ("stable_key");
--> statement-breakpoint
CREATE FUNCTION "validate_source_state_derivative_lineage"() RETURNS trigger AS $$
DECLARE
	predecessor_source_state_id uuid;
	predecessor_kind text;
BEGIN
	IF NEW.previous_derivative_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT source_state_id, kind
	INTO predecessor_source_state_id, predecessor_kind
	FROM source_state_derivatives
	WHERE id = NEW.previous_derivative_id;

	IF FOUND AND (
		predecessor_source_state_id IS DISTINCT FROM NEW.source_state_id
		OR predecessor_kind IS DISTINCT FROM NEW.kind
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			CONSTRAINT = 'source_state_derivatives_previous_matches_check',
			MESSAGE = 'Derivative predecessor must have the same Source state and kind';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "source_state_derivatives_validate_lineage" BEFORE INSERT OR UPDATE ON "source_state_derivatives" FOR EACH ROW EXECUTE FUNCTION "validate_source_state_derivative_lineage"();
--> statement-breakpoint
CREATE FUNCTION "validate_source_state_derivative_activation"() RETURNS trigger AS $$
DECLARE
	derivative_source_state_id uuid;
	derivative_kind text;
	derivative_valid boolean;
BEGIN
	SELECT source_state_id, kind, valid
	INTO derivative_source_state_id, derivative_kind, derivative_valid
	FROM source_state_derivatives
	WHERE id = NEW.derivative_id;

	IF FOUND AND (
		derivative_source_state_id IS DISTINCT FROM NEW.source_state_id
		OR derivative_kind IS DISTINCT FROM NEW.kind
		OR derivative_valid IS NOT TRUE
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			CONSTRAINT = 'source_state_derivative_activations_matching_valid_check',
			MESSAGE = 'Activation must reference a valid Derivative of the same Source state and kind';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "source_state_derivative_activations_validate" BEFORE INSERT OR UPDATE ON "source_state_derivative_activations" FOR EACH ROW EXECUTE FUNCTION "validate_source_state_derivative_activation"();
--> statement-breakpoint
CREATE FUNCTION "prevent_lirna_immutable_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "source_states_immutable" BEFORE UPDATE OR DELETE ON "source_states" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
--> statement-breakpoint
CREATE TRIGGER "source_state_resources_immutable" BEFORE UPDATE OR DELETE ON "source_state_resources" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
--> statement-breakpoint
CREATE TRIGGER "source_relations_immutable" BEFORE UPDATE OR DELETE ON "source_relations" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
--> statement-breakpoint
CREATE TRIGGER "source_state_derivatives_immutable" BEFORE UPDATE OR DELETE ON "source_state_derivatives" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
--> statement-breakpoint
CREATE TRIGGER "source_state_derivative_activations_immutable" BEFORE UPDATE OR DELETE ON "source_state_derivative_activations" FOR EACH ROW EXECUTE FUNCTION "prevent_lirna_immutable_mutation"();
