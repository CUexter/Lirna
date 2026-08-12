import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ArtifactRegistry } from "../../server/artifacts/artifact-registry.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { ApplicationDatabase } from "../../server/database/database.js";
import { assertCurrentMigrationState } from "../../server/database/migration-state.js";
import { applyMigrations } from "../../server/database/migrate.js";
import { openCurrentDatabase } from "../../server/database/open-current-database.js";
import { DomainDatabase } from "../../server/domain/synthetic-domain.js";
import { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";
import type { WorkflowDefinition } from "../../server/workflows/workflow-definition.js";
import { executeTestSql } from "./database-test-support.js";
import { forceWorkflowLeaseExpiry } from "./workflow-test-support.js";

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

  it("applies the forward migration without losing canonical records or invariants", async () => {
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const database = new ApplicationDatabase(container.getConnectionUri());
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-forward-migration-"));
    try {
      await applyMigrations(database.db);
      await database.db.execute(sql`insert into application_operations (id, kind, input, status) values ('00000000-0000-4000-8000-000000000073', 'synthetic-adapter-roundtrip', 'preserve me', 'queued')`);
      await database.db.execute(sql`
        insert into artifacts (
          hash, byte_size, sensitivity, rights_basis, provenance_origin, provenance_detail
        ) values (
          repeat('a', 64), 1, 'ordinary-cloud', 'publicly-accessible',
          'published-source', 'pre-forward provenance'
        )
      `);

      // Recreate a database at the committed baseline, then apply the forward
      // migrations exactly as an existing installation would.
      await database.db.execute(sql`drop table source_states`);
      await database.db.execute(sql`drop table sources`);
      await database.db.execute(sql`drop function reject_source_state_mutation()`);
      await database.db.execute(sql`drop table artifact_registrations`);
      await database.db.execute(sql`drop function reject_artifact_registration_mutation()`);
      await database.db.execute(sql`
        delete from drizzle.__drizzle_migrations
        where created_at in (
          select created_at from drizzle.__drizzle_migrations order by created_at desc limit 2
        )
      `);

      await applyMigrations(database.db);
      await expect(assertCurrentMigrationState(database.db)).resolves.toBeUndefined();
      const preserved = await database.db.execute<{ input: string }>(sql`select input from application_operations where id = '00000000-0000-4000-8000-000000000073'`);
      expect(preserved.rows[0]?.input).toBe("preserve me");
      const registration = await database.db.execute<{
        provenance_detail: string;
        sensitivity: string;
      }>(sql`
        select provenance_detail, sensitivity from artifact_registrations
        where hash = ${"a".repeat(64)}
      `);
      expect(registration.rows).toEqual([
        {
          provenance_detail: "pre-forward provenance",
          sensitivity: "ordinary-cloud",
        },
      ]);

      await expect(
        database.db.execute(sql`
          update artifact_registrations set provenance_detail = 'tampered'
          where hash = ${"a".repeat(64)}
        `),
      ).rejects.toThrow();
      const invariantTriggers = await database.db.execute<{ count: string }>(sql`
        select count(distinct trigger_name)::text as count
        from information_schema.triggers
        where trigger_schema = 'public' and trigger_name in (
          'artifact_identity_immutable', 'artifact_registration_immutable',
          'source_states_immutable',
          'synthetic_history_immutable', 'workflow_definition_immutable',
          'workflow_routing_immutable', 'workflow_checkpoint_immutable'
        )
      `);
      expect(invariantTriggers.rows[0]?.count).toBe("7");

      const domain = new DomainDatabase(database.db);
      const recordId = randomUUID();
      const module = domain.module("migration-proof");
      await module.revise({ recordId, label: "migrated", payload: {}, note: "created" });
      const record = await module.view(recordId);
      expect(record?.history).toHaveLength(1);
      expect(record?.events).toHaveLength(1);
      await expect(executeTestSql(database.db, sql`
        update synthetic_record_revisions set note = 'tampered'
        where record_id = ${recordId}
      `)).rejects.toThrow(/append-only/i);

      const registry = new ArtifactRegistry(
        database.db,
        new FileArtifactStore(join(temporaryRoot, "artifacts")),
      );
      const runs = new WorkflowRunRepository(database.db, registry);
      const workflow: WorkflowDefinition = {
        workflowId: "migration-proof",
        version: 1,
        steps: [{
          kind: "work",
          stepId: "prove",
          artifactShape: { type: "object", requiredKeys: ["ok"] },
          requiredReferences: [],
          budget: { leaseSeconds: 30, maxAttempts: 2 },
        }],
      };
      await runs.declare(workflow);
      const run = await runs.createRun(workflow.workflowId, workflow.version, {});
      const claims = await Promise.all([
        runs.claimNextStep(run.id),
        runs.claimNextStep(run.id),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const staleLease = claims.find(Boolean)!;
      await forceWorkflowLeaseExpiry(database.db, run.id, staleLease);
      const activeLease = (await runs.claimNextStep(run.id))!;
      await expect(runs.commitCheckpoint(run.id, staleLease, {
        content: Buffer.from('{"ok":true}'),
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: { origin: "original-reasoning", detail: "stale" },
      })).rejects.toThrow(/expired/);
      await runs.commitCheckpoint(run.id, activeLease, {
        content: Buffer.from('{"ok":true}'),
        policy: { sensitivity: "local-only", rightsBasis: "owned" },
        provenance: { origin: "original-reasoning", detail: "committed" },
      });
      await expect(executeTestSql(database.db, sql`
        update workflow_step_attempts set artifact_hash = null
        where run_id = ${run.id} and status = 'committed'
      `)).rejects.toThrow(/immutable/i);
    } finally {
      await database.close();
      await container.stop();
      await rm(temporaryRoot, { recursive: true, force: true });
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
