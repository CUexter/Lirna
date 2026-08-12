import pg from "pg";
import type { StepLease } from "../../server/workflows/workflow-run-repository.js";

const { Client } = pg;

export async function queryWorkflowDatabase(
  databaseUrl: string,
  text: string,
  values: unknown[],
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

export function forceWorkflowLeaseExpiry(
  databaseUrl: string,
  runId: string,
  lease: StepLease,
): Promise<void> {
  return queryWorkflowDatabase(
    databaseUrl,
    `UPDATE workflow_step_attempts
        SET lease_until = now() - interval '1 second'
      WHERE run_id = $1 AND step_index = $2 AND attempt = $3`,
    [runId, lease.stepIndex, lease.attempt],
  );
}
