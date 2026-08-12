import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { LirnaDatabase } from "./database.js";
import { migrationsFolder } from "./migrate.js";

export async function assertCurrentMigrationState(db: LirnaDatabase): Promise<void> {
  const expected = readMigrationFiles({ migrationsFolder });
  const result = await db.execute<{ created_at: string | number; hash: string }>(sql`
    select created_at, hash from drizzle.__drizzle_migrations order by created_at
  `).catch(() => ({ rows: [] }));
  const current = result.rows.map((migration) => ({
    createdAt: Number(migration.created_at),
    hash: migration.hash,
  }));
  const committed = expected.map((migration) => ({
    createdAt: migration.folderMillis,
    hash: migration.hash,
  }));
  if (JSON.stringify(current) !== JSON.stringify(committed)) {
    throw new Error("PostgreSQL schema is stale; run `npm run db:migrate` before starting Lirna");
  }
}
