import { identifyBearerActor } from "../access/identify-bearer-actor.js";
import { createApi } from "../api/create-api.js";
import { ArtifactRegistry } from "../artifacts/artifact-registry.js";
import { FileArtifactStore } from "../artifacts/file-artifact-store.js";
import { loadApiConfig } from "../config.js";
import { openCurrentDatabase } from "../database/open-current-database.js";
import { DomainDatabase } from "../domain/synthetic-domain.js";
import { OperationRepository } from "../operations/operation-repository.js";
import { SourceLibrary } from "../sources/source-library.js";
import { WorkflowRunRepository } from "../workflows/workflow-run-repository.js";

const config = loadApiConfig();
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
  identifyActor: identifyBearerActor({
    humanAccessToken: config.humanAccessToken,
    serviceAccessToken: config.serviceAccessToken,
  }),
});
const address = await api.listen(config.port, config.host);
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
