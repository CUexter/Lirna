import { expect, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import type { OfflineWorkingSetInventoryEntry } from "../workingSets";
import { OfflineWorkingSetInventory } from "./Inventory";

test("reports readiness and removes an invalid retained record", async () => {
  let entries: OfflineWorkingSetInventoryEntry[] = [
    {
      id: "source:state",
      target: { sourceId: "source", stateId: "state" },
      status: "corrupt",
      message: "Offline replica record is corrupt",
    },
  ];
  let discarded: string | undefined;
  render(
    <OfflineWorkingSetInventory
      workingSets={{
        inventory: async () => entries,
        subscribeInventory: () => () => undefined,
        discardInventoryEntry: async (id) => {
          discarded = id;
          entries = [];
        },
      }}
    />,
  );
  const view = within(document.body);
  await waitFor(() => view.getByText("Offline replica record is corrupt"));

  view.getByRole("button", { name: "Remove local data" }).click();

  await waitFor(() => expect(discarded).toBe("source:state"));
  await waitFor(() => view.getByText("No Source states are retained locally."));
  cleanup();
});
