import type { OfflineActivityReadiness } from "./offline-working-set";

export function offlineActivityReadiness(
  readiness: "ready" | "partial",
  reasons: string[],
): OfflineActivityReadiness[] {
  const limitation = reasons.join(" ") || undefined;
  return [
    {
      activity: "read-retained-content",
      label: "Read retained typed content",
      state: readiness === "ready" ? "supported" : "limited",
      ...(limitation ? { reason: limitation } : {}),
    },
    {
      activity: "view-retained-annotations",
      label: "View retained Annotations",
      state: "supported",
    },
    {
      activity: "view-retained-citation-selections",
      label: "View retained Citation selections",
      state: "supported",
    },
    {
      activity: "restore-retained-position",
      label: "Restore retained reading positions",
      state: "supported",
    },
    {
      activity: "save-reading-progress",
      label: "Save reading progress offline",
      state: "unsupported",
      reason: "Offline progress is not durable or synchronized yet.",
    },
    {
      activity: "change-authored-records",
      label: "Change Annotations or Citation selections offline",
      state: "unsupported",
      reason: "Authored changes require the backend and have no offline queue.",
    },
    {
      activity: "launch-without-network",
      label: "Launch the application without network access",
      state: "unsupported",
      reason:
        "Application-shell availability is not verified by this working set.",
    },
  ];
}
