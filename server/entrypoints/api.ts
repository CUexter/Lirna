import { createApi } from "../api/create-api.js";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { ArtifactRegistry } from "../artifacts/artifact-registry.js";
import { loadConfig } from "../config.js";
import { openCurrentDatabase } from "../database/open-current-database.js";
import { DomainDatabase } from "../domain/synthetic-domain.js";
import { OperationRepository } from "../operations/operation-repository.js";
import { SourceLibrary } from "../sources/source-library.js";
import { WorkflowRunRepository } from "../workflows/workflow-run-repository.js";

const config = loadConfig();
const database = await openCurrentDatabase(config.databaseUrl);

const operations = new OperationRepository(database.db);
const artifacts = new FileArtifactStore(config.artifactRoot);
const domain = new DomainDatabase(database.db);
const registry = new ArtifactRegistry(database.db, artifacts);
const workflows = new WorkflowRunRepository(database.db, registry);
const sources = new SourceLibrary(database.db);
const api = createApi({
  operations,
  artifacts,
  domain,
  workflows,
  sources,
  // The hosted API is Nathan's interactive control plane. Service identities
  // receive separately constructed, narrowly authorized application contracts.
  identifyActor: () => "human",
});
const address = await api.listen(config.port, "0.0.0.0");
console.log(`Lirna API and PWA listening at ${address}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await api.close();
  await database.close();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
