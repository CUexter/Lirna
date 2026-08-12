import pg from "pg";

const { Client } = pg;

export async function migrate(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('lirna_schema_migration'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS application_operations (
        id uuid PRIMARY KEY,
        kind text NOT NULL,
        input text NOT NULL,
        status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
        attempts integer NOT NULL DEFAULT 0,
        lease_until timestamptz,
        result jsonb,
        artifact_hash text,
        error text,
        requested_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )
    `);

    // Current state of each synthetic domain record. Identity (id) is stable
    // across revisions; owner_module records which module exclusively owns writes.
    await client.query(`
      CREATE TABLE IF NOT EXISTS synthetic_records (
        id uuid PRIMARY KEY,
        owner_module text NOT NULL,
        revision integer NOT NULL CHECK (revision >= 1),
        state jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Immutable, append-only history. One row per accepted revision; rows are
    // never updated or deleted (enforced by trigger below).
    await client.query(`
      CREATE TABLE IF NOT EXISTS synthetic_record_revisions (
        record_id uuid NOT NULL REFERENCES synthetic_records (id),
        revision integer NOT NULL CHECK (revision >= 1),
        owner_module text NOT NULL,
        state jsonb NOT NULL,
        note text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (record_id, revision)
      )
    `);

    // Content-addressed artifact registry. Identity is the artifact's sha256 hash;
    // the bytes live in a replaceable storage adapter, while PostgreSQL owns the
    // hash, source-handling policy, Provenance, and references. One row per
    // identity; identical bytes never create conflicting identities.
    await client.query(`
      CREATE TABLE IF NOT EXISTS artifacts (
        hash text PRIMARY KEY,
        byte_size bigint NOT NULL CHECK (byte_size >= 0),
        sensitivity text NOT NULL,
        rights_basis text NOT NULL,
        provenance_origin text NOT NULL,
        provenance_detail text NOT NULL,
        registered_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // References from one artifact to related objects (Sources, Owned notes,
    // Renditions, Derivatives). A reference carries an optional locator.
    await client.query(`
      CREATE TABLE IF NOT EXISTS artifact_references (
        hash text NOT NULL REFERENCES artifacts (hash),
        kind text NOT NULL,
        target_id text NOT NULL,
        locator text,
        PRIMARY KEY (hash, kind, target_id)
      )
    `);

    // Enforce immutable artifact identity at the database boundary: metadata is
    // authoritative and must not be silently rewritten. A new revision is a new
    // registered artifact; the recorded identity never changes.
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_artifact_mutation()
        RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'artifacts is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS artifact_identity_immutable ON artifacts
    `);
    await client.query(`
      CREATE TRIGGER artifact_identity_immutable
        BEFORE UPDATE OR DELETE ON artifacts
        FOR EACH ROW EXECUTE FUNCTION reject_artifact_mutation()
    `);

    // Transactional outbox. Events are written in the same transaction as the
    // state and history they describe; a relay later marks them published.
    await client.query(`
      CREATE TABLE IF NOT EXISTS domain_outbox (
        id uuid PRIMARY KEY,
        record_id uuid NOT NULL,
        owner_module text NOT NULL,
        event_type text NOT NULL,
        revision integer NOT NULL CHECK (revision >= 1),
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS domain_outbox_unpublished
        ON domain_outbox (occurred_at)
        WHERE published_at IS NULL
    `);

    // Enforce immutable history at the database boundary: reject any attempt to
    // rewrite or remove a recorded revision, even outside the module contract.
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_synthetic_history_mutation()
        RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'synthetic_record_revisions is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS synthetic_history_immutable ON synthetic_record_revisions
    `);
    await client.query(`
      CREATE TRIGGER synthetic_history_immutable
        BEFORE UPDATE OR DELETE ON synthetic_record_revisions
        FOR EACH ROW EXECUTE FUNCTION reject_synthetic_history_mutation()
    `);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('lirna_schema_migration'))");
    await client.end();
  }
}
