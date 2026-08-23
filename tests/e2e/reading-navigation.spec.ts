import { expect, test } from "@playwright/test";

import {
  clearNavigationTrace,
  expectOrderedTrace,
  installNavigationTrace,
  navigationTimeline,
  navigationTrace,
  retainArticlePosition,
  sourceId,
  stateId,
} from "./reading-navigation-helpers";

test("traces competing reading navigation commands in a real browser", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await page.evaluate(() => {
    document.body.style.minHeight = "5000px";
  });
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();

  await page
    .getByRole("button", { name: "Citation: (Steup, 2023) (resolved)" })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: "Bibliography" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByText("Citation context", { exact: true }).first().click();
  await page.getByRole("button", { name: "Show in article" }).click();

  await page.getByRole("button", { name: "Reference (1)" }).first().click();
  await expect(page.getByText("Reference context")).toBeVisible();
  await page.getByRole("button", { name: "Show in article" }).click();

  await page.getByRole("link", { name: "Note one" }).click();
  await expect(page.getByText("Typed Notes content.")).toBeVisible();

  const initialObservations = await navigationTrace(page);
  expectOrderedTrace(initialObservations, [
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
    {
      cause: "citation-return",
      owner: "article",
      target: "citation:active:/:citation-mention-1",
    },
    {
      cause: "reference-opening",
      owner: "reading-tools:supplementary",
      target: "reference:active:/:reading-reference-number-1",
    },
    {
      cause: "reference-target",
      owner: "article",
      target: "reference:active:/:reading-reference-number-1",
    },
    {
      cause: "publisher-note-navigation",
      owner: "publisher-note",
      target: "component:active:/notes.html",
    },
  ]);
  await page.goto(
    `/sources/${sourceId}/${stateId}?component=${encodeURIComponent("active:/notes.html")}`,
  );
  await expect(page.getByText("Typed Notes content.")).toBeVisible();

  await page.mouse.wheel(0, 320);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  const observations = await navigationTrace(page);
  expectOrderedTrace(observations, [
    {
      cause: "component-transition",
      owner: "article",
      target: "component:active:/notes.html",
    },
  ]);
  expect(observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cause: "direct-reader-scroll",
        owner: "article",
      }),
    ]),
  );
});

test("commits an initial fragment before movement and suppresses delayed resume", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await retainArticlePosition(page, 240);
  await page.evaluate(() => {
    history.replaceState(history.state, "", "#notation");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Notation" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const committedScrollTop = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY)).toBe(committedScrollTop);

  const observations = await navigationTrace(page);
  expectOrderedTrace(observations, [
    {
      cause: "explicit-fragment-arrival",
      owner: "article",
      target: "#notation",
    },
  ]);
  expect(
    observations.filter((observation) => observation.cause === "resume"),
  ).toEqual([]);
  const timeline = await navigationTimeline(page);
  const explicitIntent = timeline.findIndex(
    (entry) =>
      entry.type === "navigation" &&
      entry.cause === "explicit-fragment-arrival" &&
      entry.target === "#notation",
  );
  const firstMovement = timeline.findIndex((entry) => entry.type === "scroll");
  expect(explicitIntent).toBeGreaterThanOrEqual(0);
  expect(firstMovement, JSON.stringify(timeline)).toBeGreaterThan(
    explicitIntent,
  );
});

test("intercepts and replays an authored fragment before movement", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  const link = page
    .getByRole("link", { name: "Review Source information" })
    .first();
  await expect(link).toHaveAttribute("href", "#source-information");
  await expect(link).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = "5000px";
    window.scrollTo({ top: 1000 });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1000);
  await page.waitForTimeout(100);
  await clearNavigationTrace(page);

  await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href="#source-information"]',
    );
    if (!link) throw new Error("Authored fragment link missing");
    link.click();
  });

  await expect(page).toHaveURL(/#source-information$/);
  await expect
    .poll(() => navigationTimeline(page))
    .toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "scroll" })]),
    );
  const timeline = await navigationTimeline(page);
  const explicitIntent = timeline.findIndex(
    (entry) =>
      entry.type === "navigation" &&
      entry.cause === "explicit-fragment-arrival" &&
      entry.target === "#source-information",
  );
  const firstMovement = timeline.findIndex((entry) => entry.type === "scroll");
  expect(explicitIntent).toBeGreaterThanOrEqual(0);
  expect(firstMovement, JSON.stringify(timeline)).toBeGreaterThan(
    explicitIntent,
  );

  await page.goBack();
  await expect(page).not.toHaveURL(/#source-information$/);
});

test("a late fragment cannot move after a newer article fragment wins", async ({
  page,
}) => {
  await installNavigationTrace(page);
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "#late-fragment";
    link.textContent = "Delayed fragment";
    document.querySelector("main")?.append(link);
  });

  await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (anchor) => anchor.textContent === "Delayed fragment",
    );
    if (!link) throw new Error("Delayed fragment link missing");
    link.click();
  });
  await page
    .getByRole("link", { name: "Source information", exact: true })
    .click();
  await expect(page).toHaveURL(/#source-information$/);
  const winningScrollTop = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    const lateTarget = document.createElement("div");
    lateTarget.id = "late-fragment";
    lateTarget.style.marginTop = "4000px";
    lateTarget.textContent = "Late target";
    document.querySelector("main")?.append(lateTarget);
  });
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => window.scrollY)).toBe(winningScrollTop);
  const observations = await navigationTrace(page);
  expect(observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cause: "explicit-fragment-arrival",
        target: "#source-information",
      }),
    ]),
  );
  expect(observations.some((entry) => entry.target === "#late-fragment")).toBe(
    false,
  );
});

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
