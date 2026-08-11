import { setTimeout as delay } from "node:timers/promises";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { loadConfig } from "../config.js";
import { migrate } from "../database/migrate.js";
import { OperationRepository } from "../operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../worker/operation-worker.js";

const config = loadConfig();
await migrate(config.databaseUrl);

const operations = new OperationRepository(config.databaseUrl);
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
  if (!processed) {
    await delay(250);
  }
}
await operations.close();
