import { randomUUID } from "node:crypto";
import type { ObservationLevel, RequestObservation } from "../observation";
import type { SepCaptureReport, SepCaptureStage } from "./sep-capture";
import { SepAdmissionError } from "./sep-capture";

export type SepAdmissionObservation = RequestObservation;

export type OperationStage =
  | SepCaptureStage
  | "preview_persistence"
  | "database_persistence"
  | "reading_derivative_parsing";

export async function observeOperation<T>(
  operation: "submit" | "retry" | "admit",
  observation: SepAdmissionObservation | undefined,
  execute: (
    stage: (stage: OperationStage) => void,
    operationId: string,
  ) => Promise<T>,
): Promise<T> {
  const operationId = randomUUID().slice(0, 12);
  let currentStage: OperationStage | undefined;
  emit(observation, "info", {
    event: "sep_admission.started",
    operation,
    operationId,
  });
  const stage = (nextStage: OperationStage) => {
    if (currentStage === nextStage) return;
    currentStage = nextStage;
    emit(observation, "info", {
      event: "sep_admission.stage_changed",
      operation,
      operationId,
      stage: nextStage,
    });
  };
  try {
    const result = await execute(stage, operationId);
    if (result === undefined) {
      emit(observation, "error", {
        event: "sep_admission.failed",
        operation,
        operationId,
        stage: currentStage,
        outcome: "failure",
        errorName: "SepAdmissionUnavailable",
        errorMessage: "Admission preview is unavailable",
      });
      return result;
    }
    emit(observation, "info", {
      event: "sep_admission.completed",
      operation,
      operationId,
      outcome: "success",
    });
    return result;
  } catch (error) {
    const expected = error instanceof SepAdmissionError;
    emit(observation, "error", {
      event: "sep_admission.failed",
      operation,
      operationId,
      stage: currentStage,
      outcome: "failure",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage:
        error instanceof SepAdmissionError
          ? expectedErrorMessage(error.message)
          : "Unexpected SEP Admission failure",
      ...(!expected && error instanceof Error
        ? { errorStack: stackFrames(error) }
        : {}),
    });
    throw error;
  }
}

function expectedErrorMessage(message: string) {
  return message
    .replace(/^(SEP .+ capture failed):.+$/u, "$1")
    .replace(/^(SEP .+ response could not be read):.+$/u, "$1");
}

function stackFrames(error: Error) {
  return error.stack
    ?.split("\n")
    .slice(1)
    .filter((line) => line.trimStart().startsWith("at "))
    .join("\n");
}

function emit(
  observation: SepAdmissionObservation | undefined,
  level: ObservationLevel,
  record: Record<string, unknown>,
) {
  try {
    observation?.emit(level, record);
  } catch {
    // Diagnostics must not alter admission behavior.
  }
}

export function observeDegradedCapture(
  observation: SepAdmissionObservation | undefined,
  report: SepCaptureReport,
  operation: "submit" | "retry",
  operationId: string,
) {
  if (
    report.completeness === "complete" &&
    report.readingReadiness === "ready"
  ) {
    return;
  }
  const reasonCodes = new Set(
    report.unresolvedResources.map((resource) =>
      resource.limit
        ? "capture_limit"
        : resource.role === "semantic-asset"
          ? "asset_unavailable"
          : "component_unavailable",
    ),
  );
  emit(observation, "warn", {
    event: "sep_admission.capture_degraded",
    operation,
    operationId,
    completeness: report.completeness,
    readingReadiness: report.readingReadiness,
    unresolvedResourceCount: report.unresolvedResources.length,
    reasonCodes: [...reasonCodes],
  });
}
