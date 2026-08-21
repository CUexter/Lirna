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
const databaseName = `lirna_annotation_migration_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const sourceId = randomUUID();
const stateId = randomUUID();
const derivativeId = randomUUID();
const annotationId = randomUUID();

let admin: Client | undefined;
let pool: Pool | undefined;
let migrationsDirectory: string | undefined;

describePostgres("Annotation anchor migration", () => {
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

    const payload = {
      components: [
        {
          identity: "article:main",
          plainText: "😀 Heading\n\nevidence",
        },
      ],
    };
    await pool.query(
      "INSERT INTO sources (id, title) VALUES ($1, 'Legacy Source')",
      [sourceId],
    );
    await pool.query(
      `INSERT INTO source_states (
        id, source_id, sequence, adapter_id, rights_basis, sensitivity_level
      ) VALUES ($1, $2, 0, 'test', 'owned', 'ordinary-cloud')`,
      [stateId, sourceId],
    );
    await pool.query(
      `INSERT INTO source_state_derivatives (
        id, source_state_id, kind, valid, payload, validation
      ) VALUES ($1, $2, 'sep-reading-v1', true, $3, '{}')`,
      [derivativeId, stateId, JSON.stringify(payload)],
    );
    await pool.query(
      `INSERT INTO source_state_derivative_activations (
        source_state_id, derivative_id, kind
      ) VALUES ($1, $2, 'sep-reading-v1')`,
      [stateId, derivativeId],
    );
    await pool.query(
      `INSERT INTO annotations (
        id, source_state_id, component_identity, start_offset, end_offset,
        exact_text, color, body
      ) VALUES ($1, $2, 'article:main', 10, 18, 'evidence', 'yellow', 'Legacy note')`,
      [annotationId, stateId],
    );

    await applyMigration(pool, "0007_plain_randall_flagg.sql");
    await applyMigration(pool, "0008_source_state_ownership.sql");
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

  test("relocates a unique legacy quote and derives normalized context", async () => {
    const result = await pool?.query(
      `
        SELECT source_id, kind, offset_basis, start_offset, end_offset, prefix, suffix
        FROM annotations
        WHERE id = $1
      `,
      [annotationId],
    );

    expect(result?.rows[0]).toEqual({
      source_id: sourceId,
      kind: "note",
      offset_basis: "normalized-derivative-text-v1",
      start_offset: 12,
      end_offset: 20,
      prefix: "😀 Heading\n\n",
      suffix: "",
    });
  });
});

function legacyMigrationsDirectory() {
  const source = resolve(import.meta.dir, "migrations");
  const destination = mkdtempSync(join(tmpdir(), "lirna-legacy-migrations-"));
  mkdirSync(join(destination, "meta"));
  const journal = JSON.parse(
    readFileSync(join(source, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entries = journal.entries.filter(({ idx }) => idx <= 6);
  for (const { tag } of entries) {
    cpSync(join(source, `${tag}.sql`), join(destination, `${tag}.sql`));
  }
  writeFileSync(
    join(destination, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }),
  );
  return destination;
}

async function applyMigration(database: Pool, filename: string) {
  const sql = readFileSync(
    resolve(import.meta.dir, "migrations", filename),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
  await database.query(sql);
}
