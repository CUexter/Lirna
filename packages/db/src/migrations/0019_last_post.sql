ALTER TABLE "research_thread_messages" ADD COLUMN "parent_message_id" uuid;--> statement-breakpoint
ALTER TABLE "research_threads" ADD COLUMN "selected_leaf_message_id" uuid;--> statement-breakpoint
ALTER TABLE "research_thread_messages" RENAME CONSTRAINT "research_thread_messages_research_thread_id_research_threads_id" TO "research_thread_messages_thread_fk";--> statement-breakpoint
ALTER TABLE "research_evidence_receipts" RENAME CONSTRAINT "research_evidence_receipts_research_thread_id_research_threads_" TO "research_evidence_receipts_thread_fk";--> statement-breakpoint
WITH ordered_messages AS (
	SELECT "id", lag("id") OVER (
		PARTITION BY "research_thread_id" ORDER BY "sequence"
	) AS "parent_message_id"
	FROM "research_thread_messages"
)
UPDATE "research_thread_messages" AS message
SET "parent_message_id" = ordered."parent_message_id"
FROM ordered_messages AS ordered
WHERE message."id" = ordered."id";--> statement-breakpoint
UPDATE "research_threads" AS thread
SET "selected_leaf_message_id" = selected."id"
FROM (
	SELECT DISTINCT ON ("research_thread_id") "research_thread_id", "id"
	FROM "research_thread_messages"
	ORDER BY "research_thread_id", "sequence" DESC
) AS selected
WHERE thread."id" = selected."research_thread_id";--> statement-breakpoint
ALTER TABLE "research_thread_messages" ADD CONSTRAINT "research_thread_messages_parent_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."research_thread_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_threads" ADD CONSTRAINT "research_threads_selected_leaf_fk" FOREIGN KEY ("selected_leaf_message_id") REFERENCES "public"."research_thread_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_thread_messages_parent_sequence_idx" ON "research_thread_messages" USING btree ("research_thread_id","parent_message_id","sequence");--> statement-breakpoint
CREATE FUNCTION validate_research_thread_message_parent() RETURNS trigger AS $$
DECLARE
	parent_role text;
	parent_sequence integer;
BEGIN
	IF TG_OP = 'UPDATE' AND (
		NEW."research_thread_id" <> OLD."research_thread_id"
		OR NEW."parent_message_id" IS DISTINCT FROM OLD."parent_message_id"
		OR NEW."role" <> OLD."role"
	) THEN
		RAISE EXCEPTION 'A Research-thread message graph relationship is immutable' USING ERRCODE = '23514';
	END IF;
	IF NEW."parent_message_id" IS NULL THEN
		IF NEW."role" <> 'user' THEN
			RAISE EXCEPTION 'A root Research-thread message must be a user question' USING ERRCODE = '23514';
		END IF;
		RETURN NEW;
	END IF;

	SELECT "role", "sequence" INTO parent_role, parent_sequence
	FROM "research_thread_messages"
	WHERE "research_thread_id" = NEW."research_thread_id"
		AND "id" = NEW."parent_message_id";

	IF parent_role IS NULL THEN
		RAISE EXCEPTION 'A Research-thread parent must belong to the same thread' USING ERRCODE = '23503';
	END IF;
	IF parent_sequence >= NEW."sequence" THEN
		RAISE EXCEPTION 'A Research-thread parent must precede its child' USING ERRCODE = '23514';
	END IF;
	IF (NEW."role" = 'user' AND parent_role <> 'assistant')
		OR (NEW."role" = 'assistant' AND parent_role <> 'user') THEN
		RAISE EXCEPTION 'Research-thread messages must alternate user questions and assistant answers' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER research_thread_message_parent_trigger
BEFORE INSERT OR UPDATE OF "research_thread_id", "parent_message_id", "role"
ON "research_thread_messages"
FOR EACH ROW EXECUTE FUNCTION validate_research_thread_message_parent();--> statement-breakpoint
CREATE FUNCTION validate_research_thread_selected_leaf() RETURNS trigger AS $$
BEGIN
	IF NEW."selected_leaf_message_id" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "research_thread_messages"
		WHERE "research_thread_id" = NEW."id"
			AND "id" = NEW."selected_leaf_message_id"
	) THEN
		RAISE EXCEPTION 'A selected Research-thread leaf must belong to its thread' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER research_thread_selected_leaf_trigger
BEFORE INSERT OR UPDATE OF "id", "selected_leaf_message_id"
ON "research_threads"
FOR EACH ROW EXECUTE FUNCTION validate_research_thread_selected_leaf();
