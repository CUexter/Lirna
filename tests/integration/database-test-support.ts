import pg from "pg";

const { Client } = pg;

/** Reset application state when CI supplies one PostgreSQL database to all suites. */
export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        application_operations,
        synthetic_records,
        synthetic_record_revisions,
        artifacts,
        artifact_references,
        domain_outbox,
        workflow_definitions,
        workflow_runs,
        workflow_step_attempts,
        workflow_human_gates
      CASCADE
    `);
  } finally {
    await client.end();
  }
}
