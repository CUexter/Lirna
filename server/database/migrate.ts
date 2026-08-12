import { fileURLToPath } from "node:url";
import { migrate as applyDrizzleMigrations } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { ApplicationDatabase, type LirnaDatabase } from "./database.js";

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function applyMigrations(db: LirnaDatabase): Promise<void> {
  const state = await db.execute<{ application_schema: string | null; migration_schema: string | null }>(sql`
    select
      to_regclass('public.application_operations')::text as application_schema,
      to_regclass('drizzle.__drizzle_migrations')::text as migration_schema
  `);
  if (state.rows[0]?.application_schema && !state.rows[0].migration_schema) {
    const baseline = await db.execute<{
      tables: string;
      columns: string;
      constraints: string;
      indexes: string;
      functions: string;
      triggers: string;
    }>(sql`
      select
        (select count(*)::text from information_schema.tables where table_schema = 'public' and table_name in (
          'application_operations', 'synthetic_records', 'synthetic_record_revisions',
          'artifacts', 'artifact_references', 'domain_outbox', 'workflow_definitions',
          'workflow_runs', 'workflow_routing_decisions', 'workflow_step_attempts',
          'workflow_human_gates'
        )) as tables,
        (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name in (
          'application_operations', 'synthetic_records', 'synthetic_record_revisions',
          'artifacts', 'artifact_references', 'domain_outbox', 'workflow_definitions',
          'workflow_runs', 'workflow_routing_decisions', 'workflow_step_attempts',
          'workflow_human_gates'
        )) as columns,
        (select count(*)::text from information_schema.table_constraints where constraint_schema = 'public' and table_name in (
          'application_operations', 'synthetic_records', 'synthetic_record_revisions',
          'artifacts', 'artifact_references', 'domain_outbox', 'workflow_definitions',
          'workflow_runs', 'workflow_routing_decisions', 'workflow_step_attempts',
          'workflow_human_gates'
        )) as constraints,
        (select count(*)::text from pg_indexes where schemaname = 'public' and tablename in (
          'application_operations', 'synthetic_records', 'synthetic_record_revisions',
          'artifacts', 'artifact_references', 'domain_outbox', 'workflow_definitions',
          'workflow_runs', 'workflow_routing_decisions', 'workflow_step_attempts',
          'workflow_human_gates'
        )) as indexes,
        (select count(*)::text from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
          where pg_namespace.nspname = 'public' and proname in (
            'reject_artifact_mutation', 'reject_synthetic_history_mutation',
            'reject_workflow_definition_mutation', 'reject_workflow_routing_mutation',
            'reject_workflow_checkpoint_mutation'
          )) as functions,
        (select count(distinct trigger_name)::text from information_schema.triggers where trigger_schema = 'public' and trigger_name in (
          'artifact_identity_immutable', 'synthetic_history_immutable',
          'workflow_definition_immutable', 'workflow_routing_immutable',
          'workflow_checkpoint_immutable'
        )) as triggers
    `);
    const catalog = baseline.rows[0];
    if (
      catalog?.tables !== "11" ||
      catalog.columns !== "75" ||
      catalog.constraints !== "97" ||
      catalog.indexes !== "13" ||
      catalog.functions !== "5" ||
      catalog.triggers !== "5"
    ) {
      throw new Error(`Cannot adopt incomplete pre-Drizzle schema (${JSON.stringify(catalog)}); restore the complete schema before running migrations`);
    }
    // Beta.2 adopts the baseline and applies later committed migrations but omitted
    // this option from its public type.
    await applyDrizzleMigrations(db, { migrationsFolder, init: true } as Parameters<typeof applyDrizzleMigrations>[1]);
    return;
  }
  await applyDrizzleMigrations(db, { migrationsFolder });
}

export async function migrate(databaseUrl: string): Promise<void> {
  const database = new ApplicationDatabase(databaseUrl);
  try {
    await applyMigrations(database.db);
  } finally {
    await database.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to apply migrations");
  await migrate(databaseUrl);
}
