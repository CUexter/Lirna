CREATE FUNCTION "validate_citation_resolution_derivative_state"() RETURNS trigger AS $$
DECLARE
	derivative_source_state_id uuid;
BEGIN
	SELECT source_state_id
	INTO derivative_source_state_id
	FROM source_state_derivatives
	WHERE id = NEW.derivative_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = '23503',
			CONSTRAINT = 'citation_resolution_derivative_fk',
			MESSAGE = 'Citation resolution Derivative must exist before the decision is appended';
	END IF;

	IF NOT EXISTS (SELECT 1 FROM source_states WHERE id = NEW.source_state_id) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23503',
			CONSTRAINT = 'citation_resolution_state_fk',
			MESSAGE = 'Citation resolution Source state must exist before the decision is appended';
	END IF;

	IF derivative_source_state_id IS DISTINCT FROM NEW.source_state_id THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			CONSTRAINT = 'citation_resolutions_derivative_state_check',
			MESSAGE = 'Citation resolution Derivative must belong to the same Source state';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "citation_resolutions_validate_derivative_state" BEFORE INSERT OR UPDATE ON "citation_resolutions" FOR EACH ROW EXECUTE FUNCTION "validate_citation_resolution_derivative_state"();
