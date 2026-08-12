import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createApi, type ApiServer } from "../../server/api/create-api.js";
import { ArtifactRegistry } from "../../server/artifacts/artifact-registry.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { ApplicationDatabase, type LirnaDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import { DomainDatabase } from "../../server/domain/synthetic-domain.js";
import { OperationRepository } from "../../server/operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../../server/vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../../server/worker/operation-worker.js";
import { WorkflowExecutor } from "../../server/workflows/workflow-executor.js";
import type { StepLease } from "../../server/workflows/workflow-run-repository.js";
import { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";
import { resetTestDatabase } from "../integration/database-test-support.js";
import { forceWorkflowLeaseExpiry } from "../integration/workflow-test-support.js";

/**
 * A separately-owned workflow executor over the same disposable database and
 * artifact store, modelling a second worker process (for example one that
 * restarts after the first is lost). It carries its own connection pools so it
 * can be closed independently of the scenario that spawned it.
 */
export interface IndependentExecutor {
  readonly executor: WorkflowExecutor;
  close(): Promise<void>;
}

/**
 * One fully-wired Lirna application booted over disposable real infrastructure:
 * PostgreSQL authority, a content-addressed filesystem artifact store shared by
 * every module, a synthetic Vault adapter, the domain, the operation worker,
 * the typed-workflow kernel and its background executor, and the web/API
 * control plane. This is the application scenario seam the Phase 0 gate drives:
 * evidence is produced through this one boot, never against private material.
 */
export interface Phase0Scenario {
  readonly address: string;
  readonly databaseUrl: string;
  readonly database: LirnaDatabase;
  readonly root: string;
  readonly operations: OperationRepository;
  readonly artifacts: FileArtifactStore;
  readonly registry: ArtifactRegistry;
  readonly vault: SyntheticVaultAdapter;
  readonly domain: DomainDatabase;
  readonly worker: OperationWorker;
  readonly runs: WorkflowRunRepository;
  readonly executor: WorkflowExecutor;
  /**
   * Spawn a second executor over the same database and store. Used to model a
   * worker that resumes work after another worker is lost, proving resume never
   * duplicates committed work.
   */
  spawnExecutor(): IndependentExecutor;
  /**
   * Expire a step lease directly, modelling worker loss between leasing and
   * committing without waiting out the real lease clock.
   */
  forceLeaseExpiry(lease: StepLease): Promise<void>;
  close(): Promise<void>;
}

/**
 * Provision the disposable PostgreSQL the scenario runs against. In CI a single
 * disposable database is supplied through TEST_DATABASE_URL; locally a throwaway
 * container is started per scenario. Either way the schema is migrated and all
 * application state is reset so the gate begins from a known-clean database.
 */
async function provisionDatabase(): Promise<{
  databaseUrl: string;
  stop: () => Promise<void>;
}> {
  if (process.env.TEST_DATABASE_URL) {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    await migrate(databaseUrl);
    const database = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(database.db);
    await database.close();
    return { databaseUrl, stop: async () => {} };
  }
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();
  await migrate(databaseUrl);
  const database = new ApplicationDatabase(databaseUrl);
  await resetTestDatabase(database.db);
  await database.close();
  return {
    databaseUrl,
    stop: () => container.stop().then(() => undefined),
  };
}

/**
 * Boot one Phase 0 application scenario. The returned handle exposes both the
 * public control-plane address and the real module contracts so the gate can
 * drive each riskiest invariant through the seam that isolates it: the HTTP
 * control plane where a promise is observable there, and the owning module
 * contract for the transactional-outbox properties HTTP cannot isolate.
 */
export async function startPhase0Scenario(): Promise<Phase0Scenario> {
  const { databaseUrl, stop } = await provisionDatabase();
  const root = await mkdtemp(join(tmpdir(), "lirna-phase0-gate-"));

  const database = new ApplicationDatabase(databaseUrl);
  const operations = new OperationRepository(database.db);
  const artifacts = new FileArtifactStore(join(root, "artifacts"));
  const registry = new ArtifactRegistry(database.db, artifacts);
  const vault = new SyntheticVaultAdapter(join(root, "vault"));
  const domain = new DomainDatabase(database.db);
  const worker = new OperationWorker({ operations, artifacts, vault });
  const runs = new WorkflowRunRepository(database.db, registry);
  const executor = new WorkflowExecutor(runs);

  const api: ApiServer = createApi({ operations, artifacts, domain, workflows: runs });
  const address = await api.listen();

  return {
    address,
    databaseUrl,
    database: database.db,
    root,
    operations,
    artifacts,
    registry,
    vault,
    domain,
    worker,
    runs,
    executor,
    spawnExecutor() {
      const spawnStore = new FileArtifactStore(join(root, "artifacts"));
      const spawnDatabase = new ApplicationDatabase(databaseUrl);
      const spawnRegistry = new ArtifactRegistry(spawnDatabase.db, spawnStore);
      const spawnRuns = new WorkflowRunRepository(spawnDatabase.db, spawnRegistry);
      return {
        executor: new WorkflowExecutor(spawnRuns),
        close: async () => {
          await spawnDatabase.close();
        },
      };
    },
    async forceLeaseExpiry(lease) {
      await forceWorkflowLeaseExpiry(database.db, lease.runId, lease);
    },
    async close() {
      await api.close();
      await database.close();
      await rm(root, { recursive: true, force: true });
      await stop();
    },
  };
}
