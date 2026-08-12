import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

export type OperationStatus = "queued" | "processing" | "completed" | "failed";
export const syntheticOperationKind = "synthetic-adapter-roundtrip" as const;
export type OperationKind = typeof syntheticOperationKind;

export interface ApplicationOperation {
  id: string;
  kind: OperationKind;
  input: string;
  status: OperationStatus;
  result?: {
    artifactUrl: string;
    vaultPath: string;
  };
  artifactHash?: string;
  error?: string;
}

interface OperationRow {
  id: string;
  kind: OperationKind;
  input: string;
  status: OperationStatus;
  result: ApplicationOperation["result"] | null;
  artifact_hash: string | null;
  error: string | null;
}

export class OperationRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async submit(kind: OperationKind, input: string): Promise<ApplicationOperation> {
    const id = randomUUID();
    const result = await this.pool.query<OperationRow>(
      `INSERT INTO application_operations (id, kind, input, status)
       VALUES ($1, $2, $3, 'queued')
       RETURNING id, kind, input, status, result, artifact_hash, error`,
      [id, kind, input],
    );
    return mapRow(result.rows[0]!);
  }

  async get(id: string): Promise<ApplicationOperation | undefined> {
    const result = await this.pool.query<OperationRow>(
      `SELECT id, kind, input, status, result, artifact_hash, error
       FROM application_operations
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async claim(): Promise<ApplicationOperation | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<OperationRow>(
        `SELECT id, kind, input, status, result, artifact_hash, error
         FROM application_operations
         WHERE status = 'queued'
            OR (status = 'processing' AND lease_until < now())
         ORDER BY requested_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const row = claimed.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return undefined;
      }

      const updated = await client.query<OperationRow>(
        `UPDATE application_operations
         SET status = 'processing', attempts = attempts + 1,
             lease_until = now() + interval '30 seconds', error = NULL
         WHERE id = $1
         RETURNING id, kind, input, status, result, artifact_hash, error`,
        [row.id],
      );
      await client.query("COMMIT");
      return mapRow(updated.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(
    id: string,
    artifactHash: string,
    result: NonNullable<ApplicationOperation["result"]>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE application_operations
       SET status = 'completed', result = $2, artifact_hash = $3,
           lease_until = NULL, completed_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(result), artifactHash],
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE application_operations
       SET status = 'failed', error = $2, lease_until = NULL
       WHERE id = $1`,
      [id, error],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapRow(row: OperationRow): ApplicationOperation {
  return {
    id: row.id,
    kind: row.kind,
    input: row.input,
    status: row.status,
    ...(row.result ? { result: row.result } : {}),
    ...(row.artifact_hash ? { artifactHash: row.artifact_hash } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}
