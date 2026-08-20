export type ObservationLevel = "info" | "warn" | "error";

export interface RequestObservation {
  requestId: string;
  emit(level: ObservationLevel, record: Record<string, unknown>): void;
}
