import { Button } from "@lirna/ui/components/button";
import { useEffect, useState } from "react";

import {
  type OfflineWorkingSetInventoryEntry,
  type OfflineWorkingSets,
  offlineWorkingSets,
} from "./offline-working-set";

type InventoryOperations = Pick<
  OfflineWorkingSets,
  "discardInventoryEntry" | "inventory" | "subscribeInventory"
>;

export function OfflineWorkingSetInventory({
  workingSets = offlineWorkingSets,
}: {
  workingSets?: InventoryOperations;
}) {
  const [entries, setEntries] = useState<OfflineWorkingSetInventoryEntry[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void workingSets
        .inventory()
        .then((inventory) => {
          if (active) setEntries(inventory);
        })
        .catch((cause: unknown) => {
          if (active)
            setError(
              cause instanceof Error
                ? cause.message
                : "Retained inventory is unavailable",
            );
        });
    };
    refresh();
    const unsubscribe = workingSets.subscribeInventory(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [workingSets]);

  return (
    <section
      className="mt-10 border-t pt-6"
      aria-labelledby="retained-inventory"
    >
      <h2 className="font-serif text-xl" id="retained-inventory">
        Retained working sets
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Local Source states retained by this Client installation.
      </p>
      {error ? (
        <p className="mt-3 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {!error && entries.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">
          No Source states are retained locally.
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {entries.map((entry) => (
          <InventoryEntry
            entry={entry}
            key={entry.id}
            onDiscard={async () => {
              await workingSets.discardInventoryEntry(entry.id);
              setEntries(await workingSets.inventory());
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function InventoryEntry({
  entry,
  onDiscard,
}: {
  entry: OfflineWorkingSetInventoryEntry;
  onDiscard: () => Promise<void>;
}) {
  const identity = entry.target
    ? `${entry.target.sourceId} / ${entry.target.stateId}`
    : entry.id;
  return (
    <li className="rounded-md border p-3 text-sm">
      <p className="break-all font-medium">{identity}</p>
      {entry.status === "available" ? (
        <p className="mt-1 text-muted-foreground">
          Local availability: {entry.inspection.localAvailability}. Freshness:{" "}
          {entry.inspection.freshness}. Removal: {entry.inspection.removal}.
          Readiness: {entry.inspection.readiness}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-destructive">
            {entry.status === "corrupt"
              ? entry.message
              : entry.inspection.message}
          </p>
          <Button
            className="mt-2"
            onClick={() => void onDiscard()}
            size="sm"
            type="button"
            variant="outline"
          >
            Remove local data
          </Button>
        </>
      )}
    </li>
  );
}
