import type { db } from "@lirna/db";
import { createPostgresTestClient } from "@lirna/db/test-support/postgres-database";
import { sql } from "drizzle-orm";

const advisoryLockKey = 71_491;

type BlockedTable =
  | "citation_resolutions"
  | "source_state_derivative_activations";

export function createPostgresInsertBlocker(
  database: typeof db,
  databaseUrl: string,
) {
  return async (table: BlockedTable) => {
    await installBlockingTrigger(database, table);
    const lockClient = createPostgresTestClient(databaseUrl);
    const observer = createPostgresTestClient(databaseUrl);
    await Promise.all([lockClient.connect(), observer.connect()]);
    await lockClient.query("select pg_advisory_lock($1)", [advisoryLockKey]);
    let released = false;
    return {
      waitUntilInsertBlocked: () => waitForLock(observer, "advisory"),
      waitUntilOtherWriteBlocked: () => waitForNonAdvisoryLock(observer),
      async release() {
        if (released) return;
        released = true;
        await lockClient.query("select pg_advisory_unlock($1)", [
          advisoryLockKey,
        ]);
      },
      async close() {
        if (!released) {
          await lockClient.query("select pg_advisory_unlock($1)", [
            advisoryLockKey,
          ]);
        }
        await Promise.all([lockClient.end(), observer.end()]);
        await removeBlockingTrigger(database, table);
      },
    };
  };
}

async function installBlockingTrigger(
  database: typeof db,
  table: BlockedTable,
) {
  await database.execute(
    sql.raw(`
      CREATE FUNCTION block_concurrent_insert() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(${advisoryLockKey});
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER concurrent_insert_block
        BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION block_concurrent_insert();
    `),
  );
}

async function removeBlockingTrigger(database: typeof db, table: BlockedTable) {
  await database.execute(
    sql.raw(`
      DROP TRIGGER IF EXISTS concurrent_insert_block ON ${table};
      DROP FUNCTION IF EXISTS block_concurrent_insert();
    `),
  );
}

async function waitForLock(
  client: ReturnType<typeof createPostgresTestClient>,
  waitEvent: string,
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await client.query<{ waiting: string }>(
      "select count(*)::text as waiting from pg_stat_activity where datname = current_database() and wait_event = $1",
      [waitEvent],
    );
    if (result.rows[0]?.waiting !== "0") return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for PostgreSQL ${waitEvent} lock`);
}

async function waitForNonAdvisoryLock(
  client: ReturnType<typeof createPostgresTestClient>,
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await client.query<{ waiting: string }>(
      "select count(*)::text as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and wait_event <> 'advisory'",
    );
    if (result.rows[0]?.waiting !== "0") return;
    await Bun.sleep(20);
  }
  throw new Error("Timed out waiting for concurrent Source-state write");
}
