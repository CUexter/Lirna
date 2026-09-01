import { expect, test } from "@playwright/test";

import {
  expectOrderedTrace,
  installNavigationTrace,
  navigationTrace,
  setToolsPosition,
  sourceId,
  stateId,
  toolsPosition,
} from "./reading-navigation-helpers";

test("uses scoped targets for repeated citations and ambiguous local identifiers", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await page.evaluate(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    (
      window as typeof window & { __scopedScrollTargets?: string[] }
    ).__scopedScrollTargets = [];
    Element.prototype.scrollIntoView = function (...arguments_) {
      (
        window as typeof window & { __scopedScrollTargets?: string[] }
      ).__scopedScrollTargets?.push(
        this.getAttribute("data-navigation-decoy") ?? this.id,
      );
      originalScrollIntoView.apply(this, arguments_);
    };
    const decoy = document.createElement("div");
    decoy.id = "reading-reference-number-1";
    decoy.dataset.navigationDecoy = "header-decoy";
    document.querySelector("header")?.append(decoy);
  });
  await page.getByRole("button", { name: "Reference (1)" }).first().click();
  await page.getByRole("button", { name: "Show in article" }).click();

  await page
    .getByRole("button", { name: "Citation: (Steup, 2023) (resolved)" })
    .nth(1)
    .click();
  await page.getByText("Citation context", { exact: true }).nth(1).click();
  await setToolsPosition(page, 180);
  await page
    .getByRole("button", { name: "Show in article" })
    .last()
    .evaluate((element) => element.click());
  await expect.poll(() => toolsPosition(page)).toBe(180);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __scopedScrollTargets?: string[] })
          .__scopedScrollTargets,
    ),
  ).toEqual(
    expect.arrayContaining([
      "reading-reference-number-1",
      "citation-mention-2",
    ]),
  );
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __scopedScrollTargets?: string[] })
          .__scopedScrollTargets,
    ),
  ).not.toContain("header-decoy");

  expect(await navigationTrace(page)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cause: "reference-target",
        owner: "article",
        target: "scene:active:/:reference:active:/:reading-reference-number-1",
      }),
      expect.objectContaining({
        cause: "citation-return",
        owner: "article",
        target: "citation:active:/:citation-mention-2",
      }),
    ]),
  );
});

test("uses the resolved bibliography owner and returns to publisher-notes citations", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await page.getByRole("link", { name: "Note one" }).click();
  await page.locator("#citation-note-1 button").click();

  await expect(page.locator('[id="active:/:steup-2023"]')).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect
    .poll(async () =>
      (await navigationTrace(page)).some(
        (record) =>
          record.cause === "bibliography-selection" &&
          record.owner === "reading-tools:bibliography",
      ),
    )
    .toBe(true);
  await page.getByText("Citation context", { exact: true }).last().click();
  await page.getByRole("button", { name: "Show in article" }).click();
  expectOrderedTrace(await navigationTrace(page), [
    {
      cause: "bibliography-selection",
      owner: "reading-tools:bibliography",
      target: "bibliography:active:/:steup-2023",
    },
    {
      cause: "citation-return",
      owner: "publisher-note",
      target: "citation:active:/notes.html:citation-note-1",
    },
  ]);
});
