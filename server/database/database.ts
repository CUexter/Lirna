import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as artifactSchema from "../artifacts/schema.js";
import * as domainSchema from "../domain/schema.js";
import * as operationSchema from "../operations/schema.js";
import * as workflowSchema from "../workflows/schema.js";

const { Pool } = pg;

const schema = {
  ...artifactSchema,
  ...domainSchema,
  ...operationSchema,
  ...workflowSchema,
};

export type LirnaDatabase = NodePgDatabase<typeof schema>;

export class ApplicationDatabase {
  readonly db: LirnaDatabase;
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle({ client: this.pool, schema });
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
