import { expect, test } from "@playwright/test";

import {
  expectOrderedTrace,
  installNavigationTrace,
  navigationTrace,
  sourceId,
  stateId,
} from "./reading-navigation-helpers";

test("records a delayed citation command winning over note navigation", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await page.evaluate(() => {
    const note = document.querySelector<HTMLAnchorElement>(
      'a[href="notes.html#1"]',
    );
    const citation = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) =>
      button.getAttribute("aria-label")?.startsWith("Citation:"),
    );
    if (!(note && citation))
      throw new Error("Reading navigation controls missing");
    note.click();
    window.setTimeout(() => citation.click(), 0);
  });
  await expect(page.getByRole("tab", { name: "Bibliography" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const observations = await navigationTrace(page);
  expectOrderedTrace(observations, [
    {
      cause: "publisher-note-navigation",
      owner: "publisher-note",
      target: "component:active:/notes.html",
    },
    {
      cause: "bibliography-opening",
      owner: "reading-tools:bibliography",
      target: "bibliography:active:/:steup-2023",
    },
    {
      cause: "bibliography-selection",
      owner: "reading-tools:bibliography",
      target: "bibliography:active:/:steup-2023",
    },
  ]);
});
