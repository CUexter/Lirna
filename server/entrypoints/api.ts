import { createApi } from "../api/create-api.js";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { loadConfig } from "../config.js";
import { migrate } from "../database/migrate.js";
import { DomainDatabase } from "../domain/synthetic-domain.js";
import { OperationRepository } from "../operations/operation-repository.js";

const config = loadConfig();
await migrate(config.databaseUrl);

const operations = new OperationRepository(config.databaseUrl);
const artifacts = new FileArtifactStore(config.artifactRoot);
const domain = new DomainDatabase(config.databaseUrl);
const api = createApi({ operations, artifacts, domain });
const address = await api.listen(config.port, "0.0.0.0");
console.log(`Lirna API and PWA listening at ${address}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await api.close();
  await operations.close();
  await domain.close();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
