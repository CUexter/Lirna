import { expect, type Page, test } from "@playwright/test";

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

const articleIdentity = "active:/";
const notesIdentity = "active:/notes.html";

test("restores both reading owners semantically across layout changes with observable legacy fallback", async ({
  page,
}) => {
  let articleResume: Record<string, unknown> | null = null;
  let notesResume: Record<string, unknown> | null = null;
  await installNavigationTrace(page);
  await page.route("**/orpc/sources/resume**", (route) => {
    const request = `${route.request().url()} ${route.request().postData() ?? ""}`;
    const resume = request.includes(notesIdentity)
      ? notesResume
      : articleResume;
    return route.fulfill({
      body: JSON.stringify({ json: resume, meta: [] }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect(
    page.getByText("Reading position synced for Article"),
  ).toBeVisible();
  await installArticleLayout(page, 480, 18);
  await retainArticlePosition(page, 700);
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
  const articleLocation = await semanticLocation(page, "article");
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        "body { min-height: 10000px; } article :is(h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside) { min-height: 760px; font-size: 22px; }";
      document.head.append(style);
    });
  });

  articleResume = persistedPosition(articleIdentity, articleLocation, 40);
  await clearNavigationTrace(page);
  await page.reload();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect.poll(() => semanticProgressMatches(page, "article")).toBe(true);
  await expect
    .poll(async () =>
      (await navigationTrace(page)).some(
        (entry) => entry.cause === "resume" && entry.owner === "article",
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => Math.round(window.scrollY))).not.toBe(40);

  articleResume = persistedPosition(
    articleIdentity,
    {
      ...articleLocation,
      block: { ...articleLocation.block, identity: "content:unresolvable:0" },
    },
    420,
  );
  await clearNavigationTrace(page);
  await page.reload();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Math.round(window.scrollY)))
    .toBe(420);
  await expect
    .poll(async () =>
      (await navigationTrace(page)).some(
        (entry) =>
          entry.cause === "resume-legacy-fallback" &&
          entry.owner === "article" &&
          entry.target === "legacy-scroll-top:420",
      ),
    )
    .toBe(true);

  await seedLegacyPosition(page, notesIdentity, 0);
  await page.getByRole("link", { name: "Note one" }).click();
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await installPublisherNoteLayout(page, 520, 16);
  await setToolsPosition(page, 180);
  await page.locator("[data-reading-scroll-owner]").dispatchEvent("scroll");
  const notesLocation = await semanticLocation(page, "publisher-note");

  await page.getByRole("tab", { name: "Contents" }).click();
  await setToolsPosition(page, 90);
  await seedPosition(page, notesIdentity, notesLocation, 0);
  await installPublisherNoteLayout(page, 820, 21);
  await clearNavigationTrace(page);
  await page.getByRole("tab", { name: "Supplementary" }).click();
  await expect
    .poll(() => semanticProgressMatches(page, "publisher-note"))
    .toBe(true);
  await expect
    .poll(async () =>
      (await navigationTrace(page)).some(
        (entry) => entry.cause === "resume" && entry.owner === "publisher-note",
      ),
    )
    .toBe(true);
  expect(Math.round(await toolsPosition(page))).not.toBe(0);

  await page.getByRole("tab", { name: "Contents" }).click();
  await expect.poll(() => toolsPosition(page)).toBe(90);

  articleResume = persistedPosition(articleIdentity, articleLocation, 40);
  notesResume = persistedPosition(notesIdentity, notesLocation, 0);
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        '[data-reading-scene-owner="publisher-note"] p { min-height: 920px; font-size: 23px; }';
      document.head.append(style);
    });
  });
  await clearNavigationTrace(page);
  await page.goto(
    `/sources/${sourceId}/${stateId}?component=${encodeURIComponent(notesIdentity)}`,
  );
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await expect.poll(() => semanticProgressMatches(page, "article")).toBe(true);
  await expect
    .poll(() => semanticProgressMatches(page, "publisher-note"))
    .toBe(true);
  await expect
    .poll(async () => {
      const trace = await navigationTrace(page);
      return ["article", "publisher-note"].every((owner) =>
        trace.some(
          (entry) => entry.cause === "resume" && entry.owner === owner,
        ),
      );
    })
    .toBe(true);
});

type SemanticLocation = {
  block: { identity: string };
  fallback: { blockIndex: number };
  progress: number;
  scene: { owner: string };
};

async function semanticLocation(page: Page, owner: string) {
  await expect
    .poll(async () => Boolean(await readSemanticLocation(page, owner)))
    .toBe(true);
  const location = await readSemanticLocation(page, owner);
  if (!location) throw new Error(`No semantic location for ${owner}`);
  return location;
}

function readSemanticLocation(page: Page, owner: string) {
  return page.evaluate((requestedOwner) => {
    const positions = history.state?.lirnaReadingSemanticPositions;
    return Object.values(positions ?? {}).find(
      (value) =>
        (value as { scene?: { owner?: string } }).scene?.owner ===
        requestedOwner,
    ) as SemanticLocation | undefined;
  }, owner);
}

async function semanticProgressMatches(page: Page, owner: string) {
  return page.evaluate((requestedOwner) => {
    const positions = history.state?.lirnaReadingSemanticPositions;
    const semantic = Object.values(positions ?? {}).find(
      (value) =>
        (value as { scene?: { owner?: string } }).scene?.owner ===
        requestedOwner,
    ) as SemanticLocation | undefined;
    const root =
      requestedOwner === "article"
        ? document.querySelector<HTMLElement>("article")
        : document.querySelector<HTMLElement>(
            '[data-reading-scene-owner="publisher-note"]',
          );
    const container =
      requestedOwner === "article"
        ? null
        : document.querySelector<HTMLElement>("[data-reading-scroll-owner]");
    const block = root
      ?.querySelectorAll<HTMLElement>(
        "h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside",
      )
      .item(semantic?.fallback.blockIndex ?? -1);
    if (!(semantic && block) || block.getBoundingClientRect().height <= 0)
      return false;
    const blockRect = block.getBoundingClientRect();
    const viewportTop = container?.getBoundingClientRect().top ?? 0;
    const viewportHeight = container?.clientHeight ?? window.innerHeight;
    const actualProgress = Math.min(
      1,
      Math.max(
        0,
        (viewportTop + viewportHeight * 0.25 - blockRect.top) /
          blockRect.height,
      ),
    );
    return Math.abs(actualProgress - semantic.progress) < 0.02;
  }, owner);
}

function seedPosition(
  page: Page,
  componentIdentity: string,
  semantic: SemanticLocation,
  scrollTop: number,
) {
  return page.evaluate(
    ({ key, location, legacyScrollTop }) => {
      const state = history.state ?? {};
      history.replaceState(
        {
          ...state,
          lirnaReadingPositions: {
            ...(state.lirnaReadingPositions ?? {}),
            [key]: legacyScrollTop,
          },
          lirnaReadingSemanticPositions: {
            ...(state.lirnaReadingSemanticPositions ?? {}),
            [key]: location,
          },
        },
        "",
      );
    },
    {
      key: positionKey(componentIdentity),
      location: semantic,
      legacyScrollTop: scrollTop,
    },
  );
}

function seedLegacyPosition(
  page: Page,
  componentIdentity: string,
  scrollTop: number,
) {
  return page.evaluate(
    ({ key, legacyScrollTop }) => {
      const state = history.state ?? {};
      history.replaceState(
        {
          ...state,
          lirnaReadingPositions: {
            ...(state.lirnaReadingPositions ?? {}),
            [key]: legacyScrollTop,
          },
        },
        "",
      );
    },
    { key: positionKey(componentIdentity), legacyScrollTop: scrollTop },
  );
}

function positionKey(componentIdentity: string) {
  return JSON.stringify([sourceId, stateId, componentIdentity]);
}

function persistedPosition(
  componentIdentity: string,
  semanticLocation: SemanticLocation,
  scrollTop: number,
) {
  return {
    sourceId,
    stateId,
    sourceTitle:
      "The Stanford Encyclopedia of Philosophy entry on Epistemology",
    componentIdentity,
    componentLabel: componentIdentity === articleIdentity ? "Article" : "Notes",
    scrollTop,
    semanticLocation,
    savedAt: "2026-08-24T00:00:00.000Z",
  };
}

function installArticleLayout(
  page: Page,
  blockHeight: number,
  fontSize: number,
) {
  return page.addStyleTag({
    content: `body { min-height: 10000px; } article :is(h2,h3,h4,h5,h6,p,blockquote,ol,ul,table,figure,aside) { min-height: ${blockHeight}px; font-size: ${fontSize}px; }`,
  });
}

function installPublisherNoteLayout(
  page: Page,
  blockHeight: number,
  fontSize: number,
) {
  return page.addStyleTag({
    content: `[data-reading-scene-owner="publisher-note"] p { min-height: ${blockHeight}px; font-size: ${fontSize}px; }`,
  });
}
