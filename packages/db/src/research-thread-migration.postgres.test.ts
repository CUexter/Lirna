import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_research_path_migration_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = randomUUID();
const stateId = randomUUID();
const threadId = randomUUID();
const questionId = randomUUID();
const answerId = randomUUID();

let admin: Client | undefined;
let pool: Pool | undefined;
let migrationsDirectory: string | undefined;
let beforeMigration: unknown;

describePostgres("Research-thread selected-path migration", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: databaseUrl.toString() });
    migrationsDirectory = legacyMigrationsDirectory();
    await migrate(drizzle(pool), { migrationsFolder: migrationsDirectory });

    await pool.query("INSERT INTO sources (id, title) VALUES ($1, $2)", [
      sourceId,
      "Legacy Research Source",
    ]);
    await pool.query(
      `INSERT INTO source_states (
        id, source_id, sequence, adapter_id, rights_basis, sensitivity_level
      ) VALUES ($1, $2, 0, 'test', 'owned', 'ordinary-cloud')`,
      [stateId, sourceId],
    );
    await pool.query(
      `INSERT INTO research_threads (
        id, source_state_id, component_identity, component_label, title
      ) VALUES ($1, $2, 'active:/', 'Main entry', 'Legacy inquiry')`,
      [threadId, stateId],
    );
    await pool.query(
      `INSERT INTO research_thread_messages (
        id, research_thread_id, role, content, selected_text
      ) VALUES ($1, $2, 'user', $3, $4)`,
      [questionId, threadId, "What\r\nremains exact?", "Selected\ncontext"],
    );
    await pool.query(
      `INSERT INTO research_thread_messages (
        id, research_thread_id, role, content, "references"
      ) VALUES ($1, $2, 'assistant', $3, $4::jsonb)`,
      [
        answerId,
        threadId,
        "Answer with exact Markdown.\r\n\r\n[^reference]",
        JSON.stringify([
          {
            id: randomUUID(),
            componentIdentity: "active:/",
            componentLabel: "Main entry",
            selection: {
              offsetBasis: "normalized-derivative-text-v1",
              normalizedStartOffset: 4,
              normalizedEndOffset: 20,
              exactText: "Selected context",
              prefix: "Before ",
              suffix: " after",
            },
          },
        ]),
      ],
    );
    beforeMigration = await persistedPayload(pool);
    await applyMigration(pool, "0019_last_post.sql");
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    }
    if (migrationsDirectory) rmSync(migrationsDirectory, { recursive: true });
  });

  test("links the legacy transcript without changing its persisted payload", async () => {
    expect(await persistedPayload(pool as Pool)).toEqual(beforeMigration);
    const messages = await pool?.query(
      `SELECT id, parent_message_id
       FROM research_thread_messages
       WHERE research_thread_id = $1
       ORDER BY sequence`,
      [threadId],
    );
    expect(messages?.rows).toEqual([
      { id: questionId, parent_message_id: null },
      { id: answerId, parent_message_id: questionId },
    ]);
    const thread = await pool?.query(
      "SELECT selected_leaf_message_id FROM research_threads WHERE id = $1",
      [threadId],
    );
    expect(thread?.rows[0]?.selected_leaf_message_id).toBe(answerId);
  });
});

async function persistedPayload(database: Pool) {
  const result = await database.query(
    `SELECT role, content, selected_text, "references"::text AS "references"
     FROM research_thread_messages
     WHERE research_thread_id = $1
     ORDER BY sequence`,
    [threadId],
  );
  return result.rows;
}

function legacyMigrationsDirectory() {
  const source = resolve(import.meta.dir, "migrations");
  const destination = mkdtempSync(join(tmpdir(), "lirna-research-path-"));
  mkdirSync(join(destination, "meta"));
  const journal = JSON.parse(
    readFileSync(join(source, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entries = journal.entries.filter(({ idx }) => idx <= 18);
  for (const { tag } of entries)
    cpSync(join(source, `${tag}.sql`), join(destination, `${tag}.sql`));
  writeFileSync(
    join(destination, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }),
  );
  return destination;
}

async function applyMigration(database: Pool, filename: string) {
  const migration = readFileSync(
    resolve(import.meta.dir, "migrations", filename),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await database.query(statement);
  }
}
