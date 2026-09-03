export type ObservationLevel = "info" | "warn" | "error";

export function observeQuietly(observe: () => void): void {
  try {
    observe();
  } catch {
    // Diagnostics must not alter execution.
  }
}

export interface RequestObservation {
  requestId: string;
  failure?: unknown;
  emit(level: ObservationLevel, record: Record<string, unknown>): void;
  fail(error: unknown): void;
}
