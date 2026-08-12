import { setTimeout as delay } from "node:timers/promises";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { loadConfig } from "../config.js";
import { migrate } from "../database/migrate.js";
import { DomainDatabase } from "../domain/synthetic-domain.js";
import { OperationRepository } from "../operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../worker/operation-worker.js";

const config = loadConfig();
await migrate(config.databaseUrl);

const operations = new OperationRepository(config.databaseUrl);
const domain = new DomainDatabase(config.databaseUrl);
const relay = domain.relay();
const worker = new OperationWorker({
  operations,
  artifacts: new FileArtifactStore(config.artifactRoot),
  vault: new SyntheticVaultAdapter(config.syntheticVaultRoot),
});

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
  // Drain the transactional outbox; content-free by design.
  const published = await relay.drainOnce(async (event) => {
    console.log(
      `Published outbox event ${event.id} (${event.eventType}) revision ${event.revision}`,
    );
  });
  if (!processed && published === 0) {
    await delay(250);
  }
}
await operations.close();
await domain.close();
