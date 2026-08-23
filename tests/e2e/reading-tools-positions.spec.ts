import { expect, type Page, test } from "@playwright/test";

import {
  retainArticlePosition,
  setToolsPosition,
  sourceId,
  stateId,
  toolsPosition,
} from "./reading-navigation-helpers";

test("keeps article, named tabs, and publisher notes in independent locations", async ({
  page,
}) => {
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await retainArticlePosition(page, 640);

  await setToolsPosition(page, 100);
  await page.getByRole("tab", { name: "Bibliography" }).click();
  await setToolsPosition(page, 200);
  await page.getByRole("tab", { name: "Notes" }).click();
  await setToolsPosition(page, 300);
  await page.getByRole("tab", { name: "Supplementary" }).click();
  await setToolsPosition(page, 400);

  for (const [tab, scrollTop] of [
    ["Contents", 100],
    ["Bibliography", 200],
    ["Notes", 300],
    ["Supplementary", 400],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await expect
      .poll(async () => Math.round(await toolsPosition(page)))
      .toBe(scrollTop);
  }

  await page.getByRole("link", { name: "Note one" }).click();
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await expect(page.locator("[data-reading-scroll-owner]")).toHaveAttribute(
    "data-reading-scroll-owner",
    "publisher-note",
  );
  await page.waitForTimeout(100);
  await setToolsPosition(page, 200);
  await page.locator("[data-reading-scroll-owner]").dispatchEvent("scroll");
  await expect
    .poll(async () => (await publisherNoteLocation(page)).fallbackScrollTop)
    .toBe(200);
  await page.getByRole("tab", { name: "Contents" }).click();
  await page.getByRole("tab", { name: "Supplementary" }).click();
  await expect
    .poll(async () => (await publisherNoteLocation(page)).matches)
    .toBe(true);

  await retainArticlePosition(page, 640);
  await page.evaluate(() => {
    const reference = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.getAttribute("aria-label") === "Reference (1)");
    if (!reference) throw new Error("Reference control missing");
    reference.click();
  });
  await expect(page.getByText("Reference context")).toBeVisible();
  await expect(page.locator("[data-reading-scroll-owner]")).toHaveAttribute(
    "data-reading-scroll-owner",
    "reading-tools:supplementary",
  );
  await expect
    .poll(async () => Math.round(await toolsPosition(page)))
    .toBe(400);
  expect(await page.evaluate(() => window.scrollY)).toBe(640);

  await page.evaluate(() => {
    const citation = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) =>
      button.getAttribute("aria-label")?.startsWith("Citation:"),
    );
    if (!citation) throw new Error("Citation control missing");
    citation.click();
  });
  await expect(page.getByRole("tab", { name: "Bibliography" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(640);
});

async function publisherNoteLocation(page: Page) {
  return page.locator("[data-reading-scroll-owner]").evaluate((container) => {
    const positions = window.history.state?.lirnaReadingSemanticPositions;
    const semantic = Object.values(positions ?? {}).find(
      (location) =>
        (location as { scene?: { owner?: string } }).scene?.owner ===
        "publisher-note",
    ) as
      | {
          block: { identity: string };
          fallback: { blockIndex: number; scrollTop: number };
          progress: number;
        }
      | undefined;
    const root = container.querySelector<HTMLElement>(
      '[data-reading-scene-owner="publisher-note"]',
    );
    const blocks = root?.querySelectorAll<HTMLElement>(
      "h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside",
    );
    const block = semantic ? blocks?.item(semantic.fallback.blockIndex) : null;
    if (!semantic || !block || block.getBoundingClientRect().height <= 0) {
      return {
        fallbackScrollTop: semantic?.fallback.scrollTop,
        matches: false,
      };
    }
    const containerRect = container.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const actualProgress = Math.min(
      1,
      Math.max(
        0,
        (containerRect.top + container.clientHeight * 0.25 - blockRect.top) /
          blockRect.height,
      ),
    );
    return {
      fallbackScrollTop: semantic.fallback.scrollTop,
      matches: Math.abs(actualProgress - semantic.progress) < 0.01,
    };
  });
}
