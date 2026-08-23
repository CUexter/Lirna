import { expect, test } from "@playwright/test";

import {
  clearNavigationTrace,
  installNavigationTrace,
  navigationTrace,
  setToolsPosition,
  toolsPosition,
} from "./reading-navigation-helpers";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const selectedText = "Visible typed paragraph.";

const selectionSnapshot = () => {
  const sel = window.getSelection();
  return { nativeText: sel?.toString() ?? "" };
};

const highlightCovers = (expected: string) => {
  const registry = (
    CSS as typeof CSS & {
      highlights?: Map<string, Iterable<Range>> | undefined;
    }
  ).highlights;
  if (!registry) return false;
  const ranges: AbstractRange[] = [];
  for (const highlight of registry.values()) {
    try {
      for (const range of highlight) ranges.push(range);
    } catch {
      // Iterability varies across engines; keep scanning.
    }
  }
  return ranges.some((range) => range.toString() === expected);
};

async function openAnnotationNotes(page: import("@playwright/test").Page) {
  await page.getByText(selectedText, { exact: true }).selectText();
  await page.getByRole("button", { name: "Add note" }).evaluate((el) => {
    el.click();
  });
  await page
    .getByRole("complementary", { name: "Create annotation" })
    .getByRole("tab", { name: "Notes" })
    .click();
}

async function blockAnnotationReadiness(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", {
      configurable: true,
      get: () =>
        (window as typeof window & { __annotationImageReady?: boolean })
          .__annotationImageReady ?? false,
    });
    document.querySelector("article")?.append(image);
  });
}

test("preserves the visual selection while composing an annotation note", async ({
  page,
}) => {
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();

  await page.getByText(selectedText, { exact: true }).selectText();
  await expect(
    page.getByRole("dialog", { name: "Create annotation" }),
  ).toBeVisible();

  const before = await page.evaluate(selectionSnapshot);
  expect(before.nativeText).toBe(selectedText);

  // Open the side panel (compact hover -> side panel) and focus the note field.
  await page
    .getByRole("button", { name: "Add note" })
    .evaluate((el) => el.click());
  await expect(page.getByLabel("Annotation note")).toBeVisible();
  await page.getByLabel("Annotation note").evaluate((el) => el.focus());

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const active = document.activeElement;
          return active instanceof HTMLTextAreaElement ? active.value : null;
        }),
      { message: "note field is focused" },
    )
    .toBe("");

  await page.getByLabel("Annotation note").fill("Resume after reload.");

  const after = await page.evaluate(highlightCovers, selectedText);

  // Bug: the visual selection disappears when the note field is focused.
  // Fix: paint the live selection as a custom highlight so it stays visible.
  expect(after).toBe(true);

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Create annotation" }),
  ).toBeVisible();
  await expect(page.getByLabel("Annotation note")).toHaveValue(
    "Resume after reload.",
  );
});

test("lets only the latest Annotation mention return win", async ({ page }) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await openAnnotationNotes(page);
  await clearNavigationTrace(page);

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
    buttons
      .find((button) => button.textContent?.includes("introductory paragraph"))
      ?.click();
    buttons
      .find((button) => button.textContent?.includes("visible paragraph"))
      ?.click();
  });

  await expect
    .poll(async () =>
      (await navigationTrace(page)).filter(
        (record) => record.cause === "annotation-return",
      ),
    )
    .toEqual([
      expect.objectContaining({
        owner: "article",
        target: "annotation:active:/:annotation-visible",
      }),
    ]);
});

test("cancels a pending Annotation return when newer article navigation wins", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await openAnnotationNotes(page);
  await blockAnnotationReadiness(page);
  await clearNavigationTrace(page);

  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("visible paragraph"))
      ?.click();
    document
      .querySelector<HTMLAnchorElement>('a[href="#source-information"]')
      ?.click();
    (
      window as typeof window & { __annotationImageReady?: boolean }
    ).__annotationImageReady = true;
  });
  await expect(page).toHaveURL(/#source-information$/);
  await page.waitForTimeout(200);

  const observations = await navigationTrace(page);
  expect(observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cause: "explicit-fragment-arrival",
        owner: "article",
        target: "fragment:source-information",
      }),
    ]),
  );
  expect(
    observations.some((record) => record.cause === "annotation-return"),
  ).toBe(false);
  expect(
    await page.evaluate(() => CSS.highlights?.has("lirna-annotation-target")),
  ).toBe(false);
});

test("keeps Annotation movement independent from Reading-tools navigation", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await page
    .getByRole("tab", { name: "Notes" })
    .evaluate((element) => element.click());
  await setToolsPosition(page, 260);
  await page
    .getByRole("tab", { name: "Contents" })
    .evaluate((element) => element.click());
  await openAnnotationNotes(page);
  await clearNavigationTrace(page);

  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("visible paragraph"))
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) =>
        button.getAttribute("aria-label")?.startsWith("Citation:"),
      )
      ?.click();
  });

  await expect
    .poll(async () => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "annotation-return",
          owner: "article",
          target: "annotation:active:/:annotation-visible",
        }),
        expect.objectContaining({
          cause: "bibliography-opening",
          owner: "reading-tools:bibliography",
        }),
      ]),
    );
  await page
    .getByRole("complementary", { name: "Reading tools" })
    .getByRole("tab", { name: "Notes" })
    .evaluate((element) => element.click());
  await expect.poll(() => toolsPosition(page)).toBe(260);
});

test("direct reader control cancels a pending Annotation return", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await openAnnotationNotes(page);
  await blockAnnotationReadiness(page);
  await clearNavigationTrace(page);

  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("visible paragraph"))
      ?.click();
    window.dispatchEvent(new WheelEvent("wheel"));
    (
      window as typeof window & { __annotationImageReady?: boolean }
    ).__annotationImageReady = true;
  });
  await page.waitForTimeout(200);

  expect(
    (await navigationTrace(page)).some(
      (record) => record.cause === "annotation-return",
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => CSS.highlights?.has("lirna-annotation-target")),
  ).toBe(false);
});
