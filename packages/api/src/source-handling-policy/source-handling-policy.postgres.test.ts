import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPostgresTestDatabase } from "@lirna/db/test-support/postgres-database";
import { sql } from "drizzle-orm";

import { rightsBases, sensitivityLevels } from "./source-handling-policy";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_source_policy_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let cleanupDatabase: (() => Promise<void>) | undefined;

describePostgres("Source handling policy PostgreSQL parity", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const testDatabase = await createPostgresTestDatabase(
      adminUrl,
      databaseName,
    );
    database = testDatabase.database;
    cleanupDatabase = testDatabase.cleanup;
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("keeps every persisted policy vocabulary equal to the domain owner", async () => {
    const result = await database.execute(sql<{
      name: string;
      definition: string;
    }>`
      select conname as name, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in (
        'source_states_rights_basis_check',
        'source_states_sensitivity_level_check',
        'sep_admission_previews_rights_basis_check',
        'sep_admission_previews_sensitivity_level_check'
      )
      order by conname
    `);

    expect(result.rows).toHaveLength(4);
    for (const constraint of result.rows) {
      const values = [...constraint.definition.matchAll(/'([^']+)'/g)]
        .map((match) => match[1])
        .toSorted();
      const expected = constraint.name.endsWith("rights_basis_check")
        ? rightsBases
        : sensitivityLevels;
      expect(values).toEqual([...expected].toSorted());
    }
  });
});
