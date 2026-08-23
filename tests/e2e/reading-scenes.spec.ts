import { expect, test } from "@playwright/test";

import {
  clearNavigationTrace,
  installNavigationTrace,
  navigationTrace,
  retainArticlePosition,
  setToolsPosition,
  sourceId,
  stateId,
  toolsPosition,
} from "./reading-navigation-helpers";

test("routes authored scenes through their declared owners and retains both lanes", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = "5000px";
  });
  await clearNavigationTrace(page);
  await setToolsPosition(page, 220);

  await page.getByRole("link", { name: "Same scene target" }).click();
  await expect(page.getByRole("heading", { name: "Notation" })).toBeVisible();
  await expect.poll(() => toolsPosition(page)).toBe(220);
  await expect
    .poll(() => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "pending-fragment",
          owner: "article",
          target: "scene:active:/:fragment:notation",
        }),
      ]),
    );

  await retainArticlePosition(page, 640);
  await page.getByRole("link", { name: "Note one" }).click();
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  const tools = page.locator("[data-reading-scroll-owner]");
  await expect(tools).toHaveAttribute(
    "data-reading-scroll-owner",
    "publisher-note",
  );
  await expect
    .poll(() => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "publisher-note-navigation",
          owner: "publisher-note",
          target: "component:active:/notes.html",
        }),
        expect.objectContaining({
          cause: "pending-fragment",
          owner: "publisher-note",
          target: "scene:active:/notes.html:fragment:1",
        }),
      ]),
    );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(640);

  await page.getByRole("link", { name: "Same note" }).click();
  await expect
    .poll(() => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "pending-fragment",
          owner: "publisher-note",
          target: "scene:active:/notes.html:fragment:1",
        }),
      ]),
    );

  await setToolsPosition(page, 500);
  await page.waitForTimeout(100);
  await expect.poll(() => toolsPosition(page)).toBe(500);
  await page
    .getByRole("link", { name: "Back to article" })
    .evaluate((element) => element.click());
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
  await expect(tools).toHaveAttribute(
    "data-reading-scroll-owner",
    "publisher-note",
  );
  await expect.poll(() => toolsPosition(page)).toBe(500);

  await page
    .getByRole("link", { name: "Open supplement" })
    .evaluate((element) => element.click());
  await expect(page.getByText("Typed supplement one content.")).toBeVisible();
  await expect(tools).toHaveAttribute(
    "data-reading-scroll-owner",
    "publisher-note",
  );
  await expect.poll(() => toolsPosition(page)).toBe(500);
  await expect
    .poll(() => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "component-transition",
          owner: "article",
          target: "component:active:/supplement-one.html",
        }),
        expect.objectContaining({
          cause: "pending-fragment",
          owner: "article",
          target:
            "scene:active:/supplement-one.html:fragment:supplement-one-target",
        }),
      ]),
    );

  await page.goto(
    `/sources/${sourceId}/${stateId}?component=${encodeURIComponent("active:/supplement-one.html")}`,
  );
  await expect(page.getByText("Typed supplement one content.")).toBeVisible();
  await retainArticlePosition(page, 640);
  await page.getByRole("button", { name: "Next: Supplement two" }).click();
  await expect(page.getByText("Typed supplement two content.")).toBeVisible();
  await page.getByRole("button", { name: "Previous: Supplement one" }).click();
  await expect(page.getByText("Typed supplement one content.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(640);
});
