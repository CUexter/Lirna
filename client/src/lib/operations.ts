// The client boundary to the public application operation. It is deliberately
// framework-free so it can be observed by TanStack Query and exercised in
// isolation; it never caches or owns operation state itself.

export const syntheticOperationKind = "synthetic-adapter-roundtrip" as const;

export type OperationStatus = "queued" | "processing" | "completed" | "failed";

/** The terminal artifacts a completed operation exposes. */
export interface OperationResult {
  artifactUrl: string;
  resultPath: string;
}

export interface PublicOperation {
  id: string;
  status: OperationStatus;
  result?: OperationResult;
  error?: string;
}

export function isTerminalStatus(status: OperationStatus): boolean {
  return status === "completed" || status === "failed";
}

/** Read a control-plane response as an operation, surfacing failures as errors. */
async function readOperation(response: Response, failure: string): Promise<PublicOperation> {
  if (!response.ok) {
    throw new Error(failure);
  }
  return (await response.json()) as PublicOperation;
}

/** Submit one synthetic operation through the public control plane. */
export async function submitSyntheticOperation(input: string): Promise<PublicOperation> {
  const response = await fetch("/api/operations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: syntheticOperationKind, input }),
  });
  return readOperation(response, "The operation could not be submitted");
}

/** Observe one previously submitted operation. */
export async function getOperation(id: string): Promise<PublicOperation> {
  const response = await fetch(`/api/operations/${id}`);
  return readOperation(response, "The operation status could not be read");
}
