import { expect, type Page } from "@playwright/test";

export const sourceId = "10000000-0000-4000-8000-000000000000";
export const stateId = "20000000-0000-4000-8000-000000000000";

export type NavigationObservation = {
  cause: string;
  order: number;
  owner: string;
  target: string;
};

export type NavigationTimelineEntry =
  | ({ type: "navigation" } & NavigationObservation)
  | { scrollTop: number; type: "scroll" };

export async function installNavigationTrace(page: Page) {
  await page.addInitScript(() => {
    const global = window as typeof window & {
      __readingNavigationObservations?: unknown[];
      __readingNavigationTimeline?: unknown[];
    };
    global.__readingNavigationObservations = [];
    global.__readingNavigationTimeline = [];
    window.addEventListener("lirna:reading-navigation", (event) => {
      const observation = (event as CustomEvent).detail;
      global.__readingNavigationObservations?.push(observation);
      global.__readingNavigationTimeline?.push({
        ...observation,
        type: "navigation",
      });
    });
    window.addEventListener("scroll", () => {
      global.__readingNavigationTimeline?.push({
        scrollTop: window.scrollY,
        type: "scroll",
      });
    });
  });
}

export async function retainArticlePosition(page: Page, scrollTop: number) {
  await page.evaluate(() => {
    document.body.style.minHeight = "5000px";
  });
  await page.waitForTimeout(600);
  await page.evaluate((retainedScrollTop) => {
    window.dispatchEvent(new WheelEvent("wheel"));
    window.scrollTo({ top: retainedScrollTop });
  }, scrollTop);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollTop);
  await page.waitForTimeout(100);
}

export async function setToolsPosition(page: Page, scrollTop: number) {
  const tools = page.locator("[data-reading-scroll-owner]");
  await tools.evaluate((element, position) => {
    if (!document.getElementById("reading-tools-scroll-test-spacer")) {
      const style = document.createElement("style");
      style.id = "reading-tools-scroll-test-spacer";
      style.textContent =
        '[data-reading-scroll-owner]::after { content: ""; display: block; height: 2000px; }';
      document.head.append(style);
    }
    element.scrollTo({ top: position });
  }, scrollTop);
  await expect
    .poll(() => tools.evaluate((element) => element.scrollTop))
    .toBe(scrollTop);
}

export async function toolsPosition(page: Page) {
  return page
    .locator("[data-reading-scroll-owner]")
    .evaluate((element) => element.scrollTop);
}

export async function navigationTrace(
  page: Page,
): Promise<NavigationObservation[]> {
  return page.evaluate(() => {
    const global = window as typeof window & {
      __readingNavigationObservations?: NavigationObservation[];
    };
    return global.__readingNavigationObservations ?? [];
  });
}

export async function navigationTimeline(
  page: Page,
): Promise<NavigationTimelineEntry[]> {
  return page.evaluate(() => {
    const global = window as typeof window & {
      __readingNavigationTimeline?: NavigationTimelineEntry[];
    };
    return global.__readingNavigationTimeline ?? [];
  });
}

export async function clearNavigationTrace(page: Page) {
  await page.evaluate(() => {
    const global = window as typeof window & {
      __readingNavigationObservations?: unknown[];
      __readingNavigationTimeline?: unknown[];
    };
    global.__readingNavigationObservations = [];
    global.__readingNavigationTimeline = [];
  });
}

export function expectOrderedTrace(
  observations: NavigationObservation[],
  expected: Array<Pick<NavigationObservation, "cause" | "owner" | "target">>,
) {
  let after = -1;
  for (const observation of expected) {
    const index = observations.findIndex(
      (record, recordIndex) =>
        recordIndex > after &&
        record.cause === observation.cause &&
        record.owner === observation.owner &&
        record.target === observation.target,
    );
    expect(index).toBeGreaterThan(after);
    after = index;
  }
  expect(observations.map((observation) => observation.order)).toEqual(
    [...observations]
      .sort((left, right) => left.order - right.order)
      .map((observation) => observation.order),
  );
}
