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

    // Versioned typed workflow definitions. A definition is immutable once
    // declared; a materially different workflow is a new version (a new row).
    // The definition JSON carries the ordered steps, their artifact shapes,
    // declared human gates, and per-step budgets.
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        workflow_id text NOT NULL,
        version integer NOT NULL CHECK (version >= 1),
        definition jsonb NOT NULL,
        declared_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workflow_id, version)
      )
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_workflow_definition_mutation()
        RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'workflow_definitions is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS workflow_definition_immutable ON workflow_definitions
    `);
    await client.query(`
      CREATE TRIGGER workflow_definition_immutable
        BEFORE UPDATE OR DELETE ON workflow_definitions
        FOR EACH ROW EXECUTE FUNCTION reject_workflow_definition_mutation()
    `);

    // One durable workflow run. current_step is the index of the next step to
    // lease; committing a checkpoint advances it. Identity (id) is stable
    // across worker loss and resume begins at current_step, not at zero.
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id uuid PRIMARY KEY,
        workflow_id text NOT NULL,
        workflow_version integer NOT NULL,
        status text NOT NULL CHECK (status IN ('running','paused','completed','failed')),
        current_step integer NOT NULL CHECK (current_step >= 0),
        input jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_definitions (workflow_id, version)
      )
    `);
    await client.query(`
      ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check
    `);
    await client.query(`
      ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_status_check
        CHECK (status IN ('running','paused','completed','failed'))
    `);

    // The routing result is recorded before source-bearing work is leased. It
    // discloses the selected endpoint and rationale, or the concrete choices
    // that paused a non-equivalent fallback.
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_routing_decisions (
        run_id uuid NOT NULL REFERENCES workflow_runs (id),
        step_index integer NOT NULL CHECK (step_index >= 0),
        decision jsonb NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (run_id, step_index)
      )
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_workflow_routing_mutation()
        RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'workflow_routing_decisions is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS workflow_routing_immutable ON workflow_routing_decisions
    `);
    await client.query(`
      CREATE TRIGGER workflow_routing_immutable
        BEFORE UPDATE OR DELETE ON workflow_routing_decisions
        FOR EACH ROW EXECUTE FUNCTION reject_workflow_routing_mutation()
    `);

    // One row per lease attempt of one step of one run. The attempt is the unit
    // of leasing and the committed attempt is the durable checkpoint: a worker
    // leases an attempt, commits an artifact, or the lease expires and a new
    // attempt is raised. A stale lease cannot commit (workflow-valid).
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_step_attempts (
        run_id uuid NOT NULL REFERENCES workflow_runs (id),
        step_index integer NOT NULL CHECK (step_index >= 0),
        attempt integer NOT NULL CHECK (attempt >= 1),
        step_id text NOT NULL,
        lease_id uuid NOT NULL,
        lease_until timestamptz NOT NULL,
        status text NOT NULL CHECK (status IN ('leased','committed','expired')),
        artifact_hash text REFERENCES artifacts (hash),
        leased_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz,
        PRIMARY KEY (run_id, step_index, attempt)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS workflow_step_attempts_active
        ON workflow_step_attempts (run_id, step_index, status, lease_until)
    `);

    // Declared human gates, one row per gate step reached by a run. Durable and
    // inspectable: status tracks pending/satisfied/rejected and decision_hash
    // references the committed decision artifact.
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_human_gates (
        run_id uuid NOT NULL REFERENCES workflow_runs (id),
        step_index integer NOT NULL CHECK (step_index >= 0),
        step_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending','satisfied','rejected')),
        decision_hash text REFERENCES artifacts (hash),
        raised_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        PRIMARY KEY (run_id, step_index)
      )
    `);

    // A committed checkpoint is immutable: it is the durable record of one
    // step's accepted artifact. Reject any rewrite or removal at the database
    // boundary, mirroring the synthetic history invariant.
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_workflow_checkpoint_mutation()
        RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'workflow_step_attempts committed rows are immutable';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS workflow_checkpoint_immutable ON workflow_step_attempts
    `);
    await client.query(`
      CREATE TRIGGER workflow_checkpoint_immutable
        BEFORE UPDATE OR DELETE ON workflow_step_attempts
        FOR EACH ROW
        WHEN (OLD.status = 'committed')
        EXECUTE FUNCTION reject_workflow_checkpoint_mutation()
    `);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('lirna_schema_migration'))");
    await client.end();
  }
}
