import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getOperation,
  isTerminalStatus,
  type OperationStatus,
  type PublicOperation,
  submitSyntheticOperation,
} from "@/lib/operations";

const OBSERVE_INTERVAL_MS = 500;

export interface SyntheticOperationView {
  status: OperationStatus | "idle";
  operation: PublicOperation | undefined;
  errorMessage: string | undefined;
  isRunning: boolean;
  run: (input: string) => void;
}

/**
 * TanStack Query owns the operation's server state: a mutation submits it and a
 * polling query observes it until it reaches a terminal status. No component
 * store duplicates that state.
 */
export function useSyntheticOperation(): SyntheticOperationView {
  const [id, setId] = useState<string | null>(null);

  const submission = useMutation({
    mutationFn: (input: string) => submitSyntheticOperation(input),
    onSuccess: (operation) => setId(operation.id),
  });

  const observation = useQuery({
    queryKey: ["operation", id],
    queryFn: () => getOperation(id as string),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalStatus(status) ? false : OBSERVE_INTERVAL_MS;
    },
  });

  const operation = observation.data ?? submission.data ?? undefined;
  const status: OperationStatus | "idle" = submission.isPending
    ? "queued"
    : (operation?.status ?? "idle");

  const errorMessage =
    submission.error?.message ??
    observation.error?.message ??
    (operation?.status === "failed" ? operation.error : undefined);

  const isRunning =
    submission.isPending || (operation !== undefined && !isTerminalStatus(operation.status));

  return {
    status,
    operation,
    errorMessage,
    isRunning,
    run: (input: string) => submission.mutate(input),
  };
}
