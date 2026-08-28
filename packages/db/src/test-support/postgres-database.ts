import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import * as schema from "../schema";

export function createPostgresTestClient(databaseUrl: string) {
  return new Client({ connectionString: databaseUrl });
}

export function createPostgresTestConnection(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    database: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export async function createPostgresTestDatabase(
  adminUrl: string,
  databaseName: string,
) {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);

  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const migrationPool = new Pool({ connectionString: databaseUrl.toString() });
  try {
    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(import.meta.dir, "../migrations"),
    });
  } finally {
    await migrationPool.end();
  }

  const database = drizzle(databaseUrl.toString(), { schema });
  return {
    database,
    databaseUrl: databaseUrl.toString(),
    async cleanup() {
      await database.$client.end();
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    },
  };
}
