ALTER TABLE "research_thread_messages" ADD COLUMN "regenerated_from_answer_id" uuid;--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD CONSTRAINT "research_thread_messages_regenerated_from_fk" FOREIGN KEY ("regenerated_from_answer_id") REFERENCES "public"."research_thread_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION validate_research_answer_regeneration() RETURNS trigger AS $$
DECLARE
	requested_role text;
	requested_sequence integer;
	requested_parent_message_id uuid;
BEGIN
	IF TG_OP = 'UPDATE' AND NEW."regenerated_from_answer_id" IS DISTINCT FROM OLD."regenerated_from_answer_id" THEN
		RAISE EXCEPTION 'Research answer regeneration provenance is immutable' USING ERRCODE = '23514';
	END IF;
	IF NEW."regenerated_from_answer_id" IS NULL THEN
		RETURN NEW;
	END IF;
	SELECT "role", "sequence", "parent_message_id"
	INTO requested_role, requested_sequence, requested_parent_message_id
	FROM "research_thread_messages"
	WHERE "research_thread_id" = NEW."research_thread_id"
		AND "id" = NEW."regenerated_from_answer_id";
	IF requested_role IS NULL THEN
		RAISE EXCEPTION 'A regenerated Research answer must reference an answer in the same thread' USING ERRCODE = '23503';
	END IF;
	IF NEW."role" <> 'assistant' OR requested_role <> 'assistant' OR requested_sequence >= NEW."sequence" OR requested_parent_message_id IS DISTINCT FROM NEW."parent_message_id" THEN
		RAISE EXCEPTION 'Research answer regeneration provenance must reference an earlier sibling assistant answer' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER research_answer_regeneration_trigger
BEFORE INSERT OR UPDATE OF "regenerated_from_answer_id"
ON "research_thread_messages"
FOR EACH ROW EXECUTE FUNCTION validate_research_answer_regeneration();
