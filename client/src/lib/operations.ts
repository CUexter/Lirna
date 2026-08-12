// The client boundary to the public application operation. It is deliberately
// framework-free so it can be observed by TanStack Query and exercised in
// isolation; it never caches or owns operation state itself.

export const syntheticOperationKind = "synthetic-adapter-roundtrip" as const;

export type OperationStatus = "queued" | "processing" | "completed" | "failed";

export interface PublicOperation {
  id: string;
  status: OperationStatus;
  result?: { artifactUrl: string; vaultPath: string };
  error?: string;
}

export function isTerminalStatus(status: OperationStatus): boolean {
  return status === "completed" || status === "failed";
}

/** Submit one synthetic operation through the public control plane. */
export async function submitSyntheticOperation(
  input: string,
  baseUrl = "",
): Promise<PublicOperation> {
  const response = await fetch(`${baseUrl}/api/operations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: syntheticOperationKind, input }),
  });
  if (!response.ok) {
    throw new Error("The operation could not be submitted");
  }
  return (await response.json()) as PublicOperation;
}

/** Observe one previously submitted operation. */
export async function getOperation(
  id: string,
  baseUrl = "",
): Promise<PublicOperation> {
  const response = await fetch(`${baseUrl}/api/operations/${id}`);
  if (!response.ok) {
    throw new Error("The operation status could not be read");
  }
  return (await response.json()) as PublicOperation;
}
