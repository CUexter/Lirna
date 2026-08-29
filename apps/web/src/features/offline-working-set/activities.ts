import type { AppShellCompatibility } from "./appShellCompatibility";
import type { OfflineActivityReadiness } from "./workingSets";

export function offlineActivityReadiness(
  readiness: "ready" | "partial",
  reasons: string[],
  shellCompatibility: AppShellCompatibility,
  progressSynchronization: "synchronized" | "pending" | "failed",
): OfflineActivityReadiness[] {
  const limitation = reasons.join(" ") || undefined;
  return [
    requiringShell(shellCompatibility, {
      activity: "read-retained-content",
      label: "Read retained typed content",
      state: readiness === "ready" ? "supported" : "limited",
      ...(limitation ? { reason: limitation } : {}),
    }),
    requiringShell(shellCompatibility, {
      activity: "view-retained-annotations",
      label: "View retained Annotations",
      state: "supported",
    }),
    requiringShell(shellCompatibility, {
      activity: "view-retained-citation-selections",
      label: "View retained Citation selections",
      state: "supported",
    }),
    requiringShell(shellCompatibility, {
      activity: "restore-retained-position",
      label: "Restore retained reading positions",
      state: "supported",
    }),
    requiringShell(shellCompatibility, {
      activity: "save-reading-progress",
      label: "Save reading progress offline",
      state: "supported",
      ...(progressSynchronization === "pending"
        ? { reason: "Locally saved progress is waiting to synchronize." }
        : progressSynchronization === "failed"
          ? {
              reason: "Locally saved progress is preserved and can be retried.",
            }
          : {}),
    }),
    {
      activity: "change-authored-records",
      label: "Change Annotations or Citation selections offline",
      state: "unsupported",
      reason: "Authored changes require the backend and have no offline queue.",
    },
    requiringShell(shellCompatibility, {
      activity: "launch-without-network",
      label: "Launch the application without network access",
      state: "supported",
    }),
  ];
}

function requiringShell(
  shellCompatibility: AppShellCompatibility,
  readiness: OfflineActivityReadiness,
): OfflineActivityReadiness {
  if (shellCompatibility.status === "compatible") return readiness;
  return {
    ...readiness,
    state: "unsupported",
    reason: shellCompatibility.reason,
  };
}
