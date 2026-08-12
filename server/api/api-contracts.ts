import type { Context } from "hono";
import type { ArtifactStore } from "../artifacts/file-artifact-store.js";
import type { ReviseCommand, SyntheticRecordView } from "../domain/synthetic-domain.js";
import type { OperationRepository } from "../operations/operation-repository.js";
import type { SourceLibrary } from "../sources/source-library.js";
import type { WorkflowRunRepository } from "../workflows/workflow-run-repository.js";

export interface DomainContract {
  module(name: string): {
    revise(command: ReviseCommand): Promise<SyntheticRecordView>;
  };
  view(recordId: string): Promise<SyntheticRecordView | undefined>;
}

export interface ApiDependencies {
  operations: OperationRepository;
  artifacts: ArtifactStore;
  domain: DomainContract;
  workflows: WorkflowRunRepository;
  sources?: SourceLibrary;
  identifyActor?: (c: Context) => "human" | "agent";
  clientRoot?: string;
}

export async function readJson(c: Context, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("Request body too large");
  }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  return value as Record<string, unknown>;
}
