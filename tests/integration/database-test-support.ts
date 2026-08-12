import { sql, type SQL } from "drizzle-orm";
import type { LirnaDatabase } from "../../server/database/database.js";

export async function executeTestSql(db: LirnaDatabase, query: SQL): Promise<void> {
  try {
    await db.execute(query);
  } catch (error) {
    if (error instanceof Error && error.cause) throw error.cause;
    throw error;
  }
}

/** Reset application state when CI supplies one PostgreSQL database to all suites. */
export async function resetTestDatabase(db: LirnaDatabase): Promise<void> {
  await db.execute(sql.raw(`
      TRUNCATE TABLE
        application_operations,
        synthetic_records,
        synthetic_record_revisions,
        artifacts,
        artifact_registrations,
        artifact_references,
        domain_outbox,
        workflow_definitions,
        workflow_runs,
        workflow_step_attempts,
        workflow_human_gates
      CASCADE
    `));
}
