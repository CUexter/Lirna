import { setTimeout as delay } from "node:timers/promises";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { ArtifactRegistry } from "../artifacts/artifact-registry.js";
import { loadConfig } from "../config.js";
import { migrate } from "../database/migrate.js";
import { DomainDatabase } from "../domain/synthetic-domain.js";
import { OperationRepository } from "../operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../worker/operation-worker.js";
import { WorkflowExecutor } from "../workflows/workflow-executor.js";
import { WorkflowRunRepository } from "../workflows/workflow-run-repository.js";

const config = loadConfig();
await migrate(config.databaseUrl);

const operations = new OperationRepository(config.databaseUrl);
const domain = new DomainDatabase(config.databaseUrl);
const relay = domain.relay();
const artifacts = new FileArtifactStore(config.artifactRoot);
const registry = new ArtifactRegistry(config.databaseUrl, artifacts);
const workflowRuns = new WorkflowRunRepository(config.databaseUrl, registry);
const worker = new OperationWorker({
  operations,
  artifacts,
  vault: new SyntheticVaultAdapter(config.syntheticVaultRoot),
});
const workflowExecutor = new WorkflowExecutor(workflowRuns);

let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

console.log("Lirna worker is ready");
while (!stopping) {
  const processed = await worker.runOnce();
  // Advance any runnable workflow work steps; resume begins at the last
  // committed checkpoint and a stale lease cannot commit.
  const workflowAdvanced = await workflowExecutor.runOnce();
  // Drain the transactional outbox; content-free by design.
  const published = await relay.drainOnce(async (event) => {
    console.log(
      `Published outbox event ${event.id} (${event.eventType}) revision ${event.revision}`,
    );
  });
  if (!processed && !workflowAdvanced && published === 0) {
    await delay(250);
  }
}
await operations.close();
await workflowRuns.close();
await registry.close();
await domain.close();
