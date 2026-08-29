import { Button } from "@lirna/ui/components/button";
import { useEffect, useState } from "react";

import { inquiry } from "@/clients/inquiry";
import { queryClient } from "@/utils/query-client";
import {
  confirmOfflineWorkingSetRemoval,
  markOfflineWorkingSetStale,
  type OfflineWorkingSetRecord,
  readOfflineWorkingSet,
  requestOfflineWorkingSetRemoval,
  restoreOfflineWorkingSet,
  retainOfflineWorkingSet,
} from "./offline-working-set-store";

export interface OfflineWorkingSetOperations {
  read(
    sourceId: string,
    stateId: string,
  ): Promise<OfflineWorkingSetRecord | undefined>;
  retain(
    sourceId: string,
    stateId: string,
    onProgress: (completed: number, total: number) => void,
  ): Promise<OfflineWorkingSetRecord>;
  markStale(record: OfflineWorkingSetRecord): Promise<OfflineWorkingSetRecord>;
  requestRemoval(
    record: OfflineWorkingSetRecord,
  ): Promise<OfflineWorkingSetRecord>;
  restore(record: OfflineWorkingSetRecord): Promise<OfflineWorkingSetRecord>;
  confirmRemoval(sourceId: string, stateId: string): Promise<void>;
}

const browserOperations: OfflineWorkingSetOperations = {
  read: readOfflineWorkingSet,
  retain: async (sourceId, stateId, onProgress) => {
    const snapshot = await queryClient.fetchQuery(
      inquiry.sources.offlineManifest.queryOptions({
        input: { sourceId, stateId },
        staleTime: 0,
      }),
    );
    return retainOfflineWorkingSet(snapshot, onProgress);
  },
  markStale: markOfflineWorkingSetStale,
  requestRemoval: requestOfflineWorkingSetRemoval,
  restore: restoreOfflineWorkingSet,
  confirmRemoval: confirmOfflineWorkingSetRemoval,
};

export function OfflineWorkingSetPanel({
  sourceId,
  stateId,
  activationId,
  currentStateId,
  operations = browserOperations,
}: {
  sourceId: string;
  stateId: string;
  activationId?: string;
  currentStateId?: string;
  operations?: OfflineWorkingSetOperations;
}) {
  const [record, setRecord] = useState<OfflineWorkingSetRecord>();
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
        let stored = await operations.read(sourceId, stateId);
        if (
          stored &&
          ((activationId &&
            stored.manifest.activeDerivative.activationId !== activationId) ||
            (currentStateId && currentStateId !== stateId)) &&
          stored.availability !== "pending-removal"
        ) {
          stored = await operations.markStale(stored);
        }
        if (current) setRecord(stored);
      } catch (cause) {
        if (current) setError(message(cause));
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [activationId, currentStateId, operations, sourceId, stateId]);

  async function retain() {
    setPending(true);
    setError(undefined);
    setProgress({ completed: 0, total: 1 });
    try {
      setRecord(
        await operations.retain(sourceId, stateId, (completed, total) =>
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
        A typed Reading replica is retained and locally integrity-checked on
        this Client installation. Browser and service-worker caches do not count
        as readiness.
      </p>
      <OfflineWorkingSetStatus
        error={error}
        progress={progress}
        record={record}
      />
      <OfflineWorkingSetActions
        error={error}
        onChange={setRecord}
        onClear={() => {
          setRecord(undefined);
          setProgress(undefined);
        }}
        onError={(cause) => setError(message(cause))}
        operations={operations}
        onRetain={retain}
        pending={pending}
        record={record}
      />
    </section>
  );
}

function OfflineWorkingSetActions({
  error,
  onChange,
  onClear,
  onRetain,
  onError,
  operations,
  pending,
  record,
}: {
  error?: string;
  onChange: (record: OfflineWorkingSetRecord) => void;
  onClear: () => void;
  onRetain: () => Promise<void>;
  onError: (cause: unknown) => void;
  operations: OfflineWorkingSetOperations;
  pending: boolean;
  record?: OfflineWorkingSetRecord;
}) {
  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (cause) {
      onError(cause);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {!record && !error ? (
        <Button disabled={pending} onClick={onRetain}>
          {pending ? "Retaining…" : "Retain for offline reading"}
        </Button>
      ) : null}
      {record?.availability === "stale" ||
      record?.availability === "partial" ||
      error ? (
        <Button disabled={pending} onClick={onRetain}>
          {pending ? "Retrying…" : "Retry and synchronize"}
        </Button>
      ) : null}
      {record && record.availability !== "pending-removal" ? (
        <Button
          onClick={() =>
            void run(async () =>
              onChange(await operations.requestRemoval(record)),
            )
          }
          variant="outline"
        >
          Remove retained copy
        </Button>
      ) : null}
      {record?.availability === "pending-removal" ? (
        <>
          <Button
            onClick={() =>
              void run(async () => onChange(await operations.restore(record)))
            }
          >
            Keep retained copy
          </Button>
          <Button
            onClick={() =>
              void run(async () => {
                await operations.confirmRemoval(
                  record.manifest.sourceId,
                  record.manifest.stateId,
                );
                onClear();
              })
            }
            variant="destructive"
          >
            Confirm removal
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function OfflineWorkingSetStatus({
  error,
  progress,
  record,
}: {
  error?: string;
  progress?: { completed: number; total: number };
  record?: OfflineWorkingSetRecord;
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
  if (!record)
    return (
      <p className="mt-2 text-sm">Not retained on this Client installation.</p>
    );
  const labels = {
    ready: "Ready for offline reading",
    partial: "Partially ready for offline reading",
    stale: "Stale, last usable replica retained",
    "pending-removal":
      "Removal requested; replica remains usable until confirmed",
  };
  const byteSummary = `${formatBytes(record.manifest.replicaBytes)} stored replica · ${formatBytes(record.manifest.referencedResourceBytes)} declared for ${record.manifest.resources.length} referenced Source resources · synchronized ${new Date(record.manifest.synchronizedAt).toLocaleString()}`;
  return (
    <div className="mt-2 text-sm" aria-live="polite">
      <p className="font-medium">{labels[record.availability]}</p>
      <p>{byteSummary}</p>
      <p>Source-resource bodies are not retained or locally hashed.</p>
      {record.manifest.serverRetention.reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
    </div>
  );
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Offline storage is unavailable";
}

function formatBytes(value: number) {
  return `${new Intl.NumberFormat().format(value)} bytes`;
}
