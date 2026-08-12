import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ApplicationDatabase } from "../../server/database/database.js";
import { assertCurrentMigrationState } from "../../server/database/migration-state.js";
import { applyMigrations } from "../../server/database/migrate.js";
import { openCurrentDatabase } from "../../server/database/open-current-database.js";

describe("committed migration lifecycle", () => {
  it("installs cleanly and can be applied repeatedly", async () => {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const database = new ApplicationDatabase(container.getConnectionUri());
    try {
      await applyMigrations(database.db);
      await applyMigrations(database.db);
      await expect(assertCurrentMigrationState(database.db)).resolves.toBeUndefined();
      const started = await openCurrentDatabase(container.getConnectionUri());
      await started.close();
      const tables = await database.db.execute<{ count: string }>(sql`
        select count(*)::text as count from information_schema.tables
        where table_schema = 'public' and table_name = 'workflow_step_attempts'
      `);
      expect(tables.rows[0]?.count).toBe("1");
    } finally {
      await database.close();
      await container.stop();
    }
  });

  it("adopts the pre-Drizzle schema without losing canonical records", async () => {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const database = new ApplicationDatabase(container.getConnectionUri());
    try {
      await applyMigrations(database.db);
      await database.db.execute(sql`insert into application_operations (id, kind, input, status) values ('00000000-0000-4000-8000-000000000073', 'synthetic-adapter-roundtrip', 'preserve me', 'queued')`);
      await database.db.execute(sql`drop schema drizzle cascade`);

      await applyMigrations(database.db);
      await expect(assertCurrentMigrationState(database.db)).resolves.toBeUndefined();
      const preserved = await database.db.execute<{ input: string }>(sql`select input from application_operations where id = '00000000-0000-4000-8000-000000000073'`);
      expect(preserved.rows[0]?.input).toBe("preserve me");
    } finally {
      await database.close();
      await container.stop();
    }
  });

  it("refuses to certify a partial pre-Drizzle schema", async () => {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const database = new ApplicationDatabase(container.getConnectionUri());
    try {
      await database.db.execute(sql`create table application_operations (id uuid primary key)`);
      await expect(applyMigrations(database.db)).rejects.toThrow("incomplete pre-Drizzle schema");
      await expect(openCurrentDatabase(container.getConnectionUri())).rejects.toThrow("npm run db:migrate");
    } finally {
      await database.close();
      await container.stop();
    }
  });

  it("rejects stale startup without changing the schema", async () => {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const database = new ApplicationDatabase(container.getConnectionUri());
    try {
      const before = await database.db.execute<{ count: string }>(sql`select count(*)::text as count from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`);
      await expect(assertCurrentMigrationState(database.db)).rejects.toThrow("npm run db:migrate");
      const after = await database.db.execute<{ count: string }>(sql`select count(*)::text as count from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`);
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    } finally {
      await database.close();
      await container.stop();
    }
  });
});
