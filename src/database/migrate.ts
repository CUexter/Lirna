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
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('lirna_schema_migration'))");
    await client.end();
  }
}
