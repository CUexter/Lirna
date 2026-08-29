import { Button } from "@lirna/ui/components/button";
import { useEffect, useState } from "react";

import {
  type OfflineWorkingSetInspection,
  type OfflineWorkingSets,
  offlineWorkingSets,
} from "./offline-working-set";

export function OfflineWorkingSetPanel({
  sourceId,
  stateId,
  workingSets = offlineWorkingSets,
}: {
  sourceId: string;
  stateId: string;
  workingSets?: OfflineWorkingSets;
}) {
  const [inspection, setInspection] = useState<OfflineWorkingSetInspection>();
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
  }>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const result = await workingSets.inspect({ sourceId, stateId });
        if (current) setInspection(result);
      } catch (cause) {
        if (current) setError(message(cause));
      }
    }
    const unsubscribe = workingSets.subscribe({ sourceId, stateId }, () => {
      void load();
    });
    void load();
    return () => {
      current = false;
      unsubscribe();
    };
  }, [sourceId, stateId, workingSets]);

  async function retain() {
    setPending(true);
    setError(undefined);
    setProgress({ completed: 0, total: 1 });
    try {
      setInspection(
        await workingSets.retain({ sourceId, stateId }, (completed, total) =>
          setProgress({ completed, total }),
        ),
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="offline-working-set-title"
      className="border bg-background p-4"
    >
      <h3 className="font-medium" id="offline-working-set-title">
        Offline working set
      </h3>
      <p className="mt-1 text-muted-foreground text-sm">
        Offline-reading readiness requires both a compatible application shell
        and a locally integrity-checked typed Reading replica on this Client
        installation.
      </p>
      <OfflineWorkingSetStatus
        error={error}
        inspection={inspection}
        progress={progress}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <RetentionAction
          error={error}
          inspection={inspection}
          onRetain={retain}
          pending={pending}
        />
        <RemovalActions
          events={{
            onChange: setInspection,
            onClear: () => {
              setInspection({ status: "absent" });
              setProgress(undefined);
            },
            onError: (cause) => setError(message(cause)),
          }}
          inspection={inspection}
          target={{ sourceId, stateId }}
          workingSets={workingSets}
        />
      </div>
    </section>
  );
}

function RetentionAction({
  error,
  inspection,
  onRetain,
  pending,
}: {
  error?: string;
  inspection?: OfflineWorkingSetInspection;
  onRetain: () => Promise<void>;
  pending: boolean;
}) {
  if (inspection?.status === "absent" && !error) {
    return (
      <Button disabled={pending} onClick={onRetain}>
        {pending ? "Retaining…" : "Retain for offline reading"}
      </Button>
    );
  }
  if (
    !error &&
    !(
      inspection?.status === "available" &&
      (inspection.freshness === "outdated" ||
        inspection.readiness === "partial")
    )
  ) {
    return null;
  }
  return (
    <Button disabled={pending} onClick={onRetain}>
      {pending ? "Retrying…" : "Retry and synchronize"}
    </Button>
  );
}

function RemovalActions({
  events,
  inspection,
  target,
  workingSets,
}: {
  events: {
    onChange: (inspection: OfflineWorkingSetInspection) => void;
    onClear: () => void;
    onError: (cause: unknown) => void;
  };
  inspection?: OfflineWorkingSetInspection;
  target: { sourceId: string; stateId: string };
  workingSets: OfflineWorkingSets;
}) {
  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (cause) {
      events.onError(cause);
    }
  }

  if (inspection?.status !== "available") return null;
  if (inspection.removal !== "pending") {
    return (
      <Button
        onClick={() =>
          void run(async () =>
            events.onChange(await workingSets.requestRemoval(target)),
          )
        }
        variant="outline"
      >
        Remove retained copy
      </Button>
    );
  }
  return (
    <>
      <Button
        onClick={() =>
          void run(async () =>
            events.onChange(await workingSets.restore(target)),
          )
        }
      >
        Keep retained copy
      </Button>
      <Button
        onClick={() =>
          void run(async () => {
            await workingSets.confirmRemoval(target);
            events.onClear();
          })
        }
        variant="destructive"
      >
        Confirm removal
      </Button>
    </>
  );
}

export function OfflineWorkingSetStatus({
  error,
  inspection,
  progress,
}: {
  error?: string;
  inspection?: OfflineWorkingSetInspection;
  progress?: { completed: number; total: number };
}) {
  if (error)
    return (
      <p className="mt-2 text-destructive text-sm" role="alert">
        Retention failed: {error}
      </p>
    );
  if (progress && progress.completed < progress.total)
    return (
      <div className="mt-2 text-sm" aria-live="polite">
        <progress
          aria-label="Offline retention progress"
          max={progress.total}
          value={progress.completed}
        />
        <p>
          Retained {progress.completed} of {progress.total} items.
        </p>
      </div>
    );
  if (!inspection || inspection.status === "absent")
    return (
      <p className="mt-2 text-sm">Not retained on this Client installation.</p>
    );
  if (inspection.status === "incompatible")
    return (
      <div className="mt-2 text-sm" aria-live="polite">
        <p className="font-medium">Offline reading unavailable</p>
        <p>{inspection.message}</p>
      </div>
    );
  const byteSummary = `${formatBytes(inspection.replicaBytes)} stored replica · ${formatBytes(inspection.referencedResourceBytes)} declared for ${inspection.referencedResourceCount} referenced Source resources · synchronized ${new Date(inspection.synchronizedAt).toLocaleString()}`;
  const readinessLabel = {
    ready: "Ready for supported offline activities",
    partial: "Partial capability for supported offline activities",
    unavailable: "Offline reading unavailable; retained data preserved",
  }[inspection.readiness];
  return (
    <div className="mt-2 text-sm" aria-live="polite">
      <p className="font-medium">{readinessLabel}</p>
      <p>Locally available: readable on this Client installation.</p>
      <p>{shellCompatibilityLabel(inspection.shellCompatibility)}</p>
      <p>Freshness: {freshnessLabel(inspection.freshness)}</p>
      <p>
        Removal:{" "}
        {inspection.removal === "pending" ? "pending" : "not requested"}. The
        replica remains readable until removal is confirmed.
      </p>
      <p>{byteSummary}</p>
      <p>Source-resource bodies are not retained or locally hashed.</p>
      <ul className="mt-2 list-disc pl-5">
        {inspection.activities.map((activity) => (
          <li key={activity.activity}>
            {activity.label}: {activity.state}
            {activity.reason ? ` - ${activity.reason}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function shellCompatibilityLabel(
  compatibility: Extract<
    OfflineWorkingSetInspection,
    { status: "available" }
  >["shellCompatibility"],
) {
  if (compatibility.status === "compatible")
    return `Application shell ${compatibility.shellVersion} is compatible with persisted working-set version ${compatibility.persistedVersion}.`;
  return `Application shell unavailable: ${compatibility.reason}`;
}

function freshnessLabel(freshness: "current" | "outdated" | "unknown") {
  if (freshness === "current") return "current after an online comparison.";
  if (freshness === "outdated")
    return "outdated; the historical replica remains readable.";
  return "unknown because no online comparison was possible.";
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Offline storage is unavailable";
}

function formatBytes(value: number) {
  return `${new Intl.NumberFormat().format(value)} bytes`;
}
