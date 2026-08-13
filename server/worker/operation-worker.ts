import type { ArtifactStore } from "../artifacts/file-artifact-store.js";
import {
  type OperationRepository,
  syntheticOperationKind,
} from "../operations/operation-repository.js";
import type { ResultWriter } from "../synthetic/synthetic-result-writer.js";

interface WorkerDependencies {
  operations: OperationRepository;
  artifacts: ArtifactStore;
  resultWriter: ResultWriter;
}

export class OperationWorker {
  constructor(private readonly dependencies: WorkerDependencies) {}

  async runOnce(): Promise<boolean> {
    const operation = await this.dependencies.operations.claim();
    if (!operation) {
      return false;
    }

    try {
      if (operation.kind !== syntheticOperationKind) {
        throw new Error(`Unsupported operation kind: ${operation.kind}`);
      }

      const content = Buffer.from(`Synthetic operation result\n\n${operation.input}\n`, "utf8");
      const artifact = await this.dependencies.artifacts.put(content);
      const result = await this.dependencies.resultWriter.writeSyntheticResult(
        operation.id,
        content.toString("utf8"),
      );
      await this.dependencies.operations.complete(operation.id, artifact.hash, {
        artifactUrl: `/api/operations/${operation.id}/artifact`,
        resultPath: result.path,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      await this.dependencies.operations.fail(operation.id, message);
      throw error;
    }
  }
}
