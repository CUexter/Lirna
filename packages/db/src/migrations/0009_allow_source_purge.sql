CREATE OR REPLACE FUNCTION "prevent_lirna_immutable_mutation"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND current_setting('lirna.allow_immutable_deletion', true) = 'on' THEN
		RETURN OLD;
	END IF;

	RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
