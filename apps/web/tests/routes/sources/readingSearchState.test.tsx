import { expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import {
  renderReading,
  resetActions,
  view,
} from "@/features/reading-workspace/test-support/routeHarness";
import { expectBibliographyRoute } from "@/features/reading-workspace/test-support/routeScenarios";

test("restores Bibliography and Citation context from route search", async () => {
  resetActions();
  const router = await renderReading(
    "?component=article&view=bibliography&citation=entry-one",
  );

  await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
  expectBibliographyRoute(router);
  expect(
    view().getByText("Ada Lovelace. Synthetic publisher entry."),
  ).toBeTruthy();
  expect(document.getElementById("article:entry-one")).not.toBeNull();
});
