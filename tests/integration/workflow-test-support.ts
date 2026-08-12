import { sql } from "drizzle-orm";
import type { LirnaDatabase } from "../../server/database/database.js";
import type { StepLease } from "../../server/workflows/workflow-run-repository.js";

export async function forceWorkflowLeaseExpiry(
  database: LirnaDatabase,
  runId: string,
  lease: StepLease,
): Promise<void> {
  await database.execute(sql`
    UPDATE workflow_step_attempts
       SET lease_until = now() - interval '1 second'
     WHERE run_id = ${runId}
       AND step_index = ${lease.stepIndex}
       AND attempt = ${lease.attempt}
  `);
}
