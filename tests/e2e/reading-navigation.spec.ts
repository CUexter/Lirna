import { expect, type Page, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

type NavigationObservation = {
  cause: string;
  order: number;
  owner: "article" | "reading-tools";
  target: string;
};

async function installNavigationTrace(page: Page) {
  await page.addInitScript(() => {
    const global = window as typeof window & {
      __readingNavigationObservations?: unknown[];
    };
    global.__readingNavigationObservations = [];
    window.addEventListener("lirna:reading-navigation", (event) => {
      global.__readingNavigationObservations?.push(
        (event as CustomEvent).detail,
      );
    });
  });
}

async function retainArticlePosition(page: Page, scrollTop: number) {
  await page.evaluate(() => {
    document.body.style.minHeight = "5000px";
    window.location.hash = "knowledge";
  });
  await expect(page).toHaveURL(/#knowledge$/);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await page.evaluate((retainedScrollTop) => {
    window.scrollTo({ top: retainedScrollTop });
  }, scrollTop);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollTop);
  await page.waitForTimeout(600);
}

async function navigationTrace(page: Page): Promise<NavigationObservation[]> {
  return page.evaluate(() => {
    const global = window as typeof window & {
      __readingNavigationObservations?: NavigationObservation[];
    };
    return global.__readingNavigationObservations ?? [];
  });
}

function expectOrderedTrace(
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
    .click();
  await expect(page.getByRole("tab", { name: "Bibliography" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByText("Citation context", { exact: true }).click();
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
      owner: "reading-tools",
      target: "#steup-2023",
    },
    {
      cause: "bibliography-selection",
      owner: "reading-tools",
      target: "#active:/:steup-2023",
    },
    {
      cause: "citation-return",
      owner: "article",
      target: "#citation-mention-1",
    },
    {
      cause: "reference-opening",
      owner: "reading-tools",
      target: "#reading-reference-number-1",
    },
    {
      cause: "reference-target",
      owner: "article",
      target: "#reading-reference-number-1",
    },
    {
      cause: "publisher-note-navigation",
      owner: "reading-tools",
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

test("records the deterministic explicit-fragment winner over resume", async ({
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

  const observations = await navigationTrace(page);
  expectOrderedTrace(observations, [
    {
      cause: "explicit-fragment-arrival",
      owner: "article",
      target: "#notation",
    },
    {
      cause: "pending-fragment",
      owner: "article",
      target: "#notation",
    },
  ]);
  expect(
    observations.filter((observation) => observation.cause === "resume"),
  ).toEqual([]);
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
      owner: "reading-tools",
      target: "component:active:/notes.html",
    },
    {
      cause: "bibliography-opening",
      owner: "reading-tools",
      target: "#steup-2023",
    },
    {
      cause: "bibliography-selection",
      owner: "reading-tools",
      target: "#active:/:steup-2023",
    },
  ]);
});
