import type { SepCaptureLimits } from "./bundle";
import type { OptionalCaptureResult } from "./bundle-capture";
import type { SepCaptureReport } from "./client";

export function mergeOptionalResults(
  active: OptionalCaptureResult,
  archive: OptionalCaptureResult,
): OptionalCaptureResult {
  return {
    resources: [...active.resources, ...archive.resources],
    unresolved: [...active.unresolved, ...archive.unresolved],
    unknownComponent: active.unknownComponent || archive.unknownComponent,
    consumedBytes: archive.consumedBytes,
  };
}

export function buildCaptureReport(
  budget: "standard" | "expanded",
  limits: SepCaptureLimits,
  optional: OptionalCaptureResult,
): SepCaptureReport {
  const stopped = optional.unresolved.some((item) => item.limit);
  const readinessReasons = [
    ...(optional.unresolved.some((item) => item.role !== "semantic-asset")
      ? ["One or more authored reading components are unavailable"]
      : []),
    ...(optional.unknownComponent
      ? ["An unknown component requires explicit reading support"]
      : []),
  ];
  return {
    budget,
    completeness: stopped
      ? "stopped"
      : optional.unresolved.length
        ? "partial"
        : "complete",
    readingReadiness: readinessReasons.length ? "degraded" : "ready",
    readinessReasons,
    unresolvedResources: optional.unresolved,
    limits,
    retryUsed: budget === "expanded",
  };
}

export function compactLimits(limits: SepCaptureLimits): SepCaptureLimits {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("SEP capture limits must be positive safe integers");
    }
  }
  return limits;
}
