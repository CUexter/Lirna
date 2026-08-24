export type ObservationLevel = "info" | "warn" | "error";

export interface RequestObservation {
  requestId: string;
  failure?: unknown;
  emit(level: ObservationLevel, record: Record<string, unknown>): void;
  fail(error: unknown): void;
}
