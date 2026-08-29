import { expect, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const readingUrl = `/sources/${sourceId}/${stateId}`;

test("retains and reads a verified working set with the backend unavailable", async ({
  page,
}) => {
  await page.goto(readingUrl);
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  await expect(
    page.getByText("Ready for supported offline activities"),
  ).toBeVisible();
  await expect(page.getByText(/Freshness: current/)).toBeVisible();
  await expect(
    page.getByText(/View retained Annotations: supported/),
  ).toBeVisible();
  await expect(
    page.getByText(/Save reading progress offline: unsupported/),
  ).toBeVisible();
  await expect(
    page.getByText(/Application-shell availability is not verified/),
  ).toBeVisible();
  await expect(page.getByText(/stored replica/)).toBeVisible();
  await expect(
    page.getByText(/declared for .* referenced Source resources/),
  ).toBeVisible();
  await expect(
    page.getByText(/Source-resource bodies are not retained/),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return Boolean(registration.active);
      }),
    )
    .toBe(true);

  await page.route("**/orpc/**", (route) => route.abort("connectionfailed"));
  await page.reload();

  await expect(page.getByText(/Freshness: unknown/)).toBeVisible();
  await expect(
    page.getByText(/Backend unavailable.*verified replica/),
  ).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect(page.getByAltText("Retained semantic diagram")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const locations = window.history.state?.lirnaReadingLocations ?? {};
        return Object.values(locations)[0]?.fallback?.scrollTop;
      }),
    )
    .toBe(240);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const highlights = (
          CSS as typeof CSS & { highlights?: Map<string, Iterable<Range>> }
        ).highlights;
        if (!highlights) return false;
        return [...highlights.values()].some((highlight) =>
          [...highlight].some(
            (range) => range.toString() === "Visible typed paragraph.",
          ),
        );
      }),
    )
    .toBe(true);

  const componentSelector = page.getByLabel("Source component", {
    exact: true,
  });
  if (await componentSelector.isVisible()) {
    await componentSelector.selectOption("active:/notes.html");
  } else {
    await page.getByRole("link", { name: "Note one" }).click();
  }
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await page.getByRole("link", { name: "Open supplement" }).click();
  await expect(page.getByText("Typed supplement one content.")).toBeVisible();

  await page.goto(readingUrl);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await page.getByRole("tab", { name: "Bibliography" }).click();
  await page.getByLabel("Search bibliography").fill("Steup");
  await expect(page.getByText("online only")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Publisher page/ }),
  ).toHaveAttribute("href", "https://example.com/epistemology");
});

test("returns to the online Reading workspace after retained fallback", async ({
  page,
}) => {
  await page.goto(readingUrl);
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  await expect(
    page.getByText("Ready for supported offline activities"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return Boolean(registration.active);
      }),
    )
    .toBe(true);
  await page.route("**/orpc/**", (route) => route.abort("connectionfailed"));
  await page.reload();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();

  await page.unroute("**/orpc/**");
  await page.route("**/orpc/sources/readingWorkspace*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.json.reading.source.title = "Online recovery title";
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Online recovery title" }),
  ).toBeVisible();
});

test("makes removal recoverable until explicit confirmation", async ({
  page,
}) => {
  await page.goto(readingUrl);
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  await page.getByRole("button", { name: "Remove retained copy" }).click();
  await expect(page.getByText(/Removal: pending/)).toBeVisible();
  await page.getByRole("button", { name: "Keep retained copy" }).click();
  await expect(page.getByText(/Removal: not requested/)).toBeVisible();
  await page.getByRole("button", { name: "Remove retained copy" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByText(/Not retained/)).toBeVisible();
  await page.route("**/orpc/**", (route) => route.abort("connectionfailed"));
  await page.reload();
  await expect(page.getByText("Reading workspace unavailable")).toBeVisible();
});

test("retains the last usable activation when the working set becomes stale", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-e2e-session": `offline-stale-${testInfo.project.name}-${testInfo.retry}`,
  });
  await page.goto(readingUrl);
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  const versions = page.getByRole("region", {
    name: "Reading Derivative versions",
  });
  await versions.getByRole("button", { name: "Generate candidate" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await versions.getByRole("button", { name: "Activate candidate" }).click();
  await expect(page.getByText(/Freshness: outdated/)).toBeVisible();
  await page.route("**/orpc/**", (route) => route.abort("connectionfailed"));
  await page.reload();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
});

test("explains partial readiness and recovers by retrying", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-e2e-session": `offline-partial-${testInfo.project.name}-${testInfo.retry}`,
  });
  await page.goto(readingUrl);
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  await expect(
    page.getByText("Partial capability for supported offline activities"),
  ).toBeVisible();
  await expect(page.getByText("Supplement unavailable")).toBeVisible();

  await page.setExtraHTTPHeaders({
    "x-e2e-session": `offline-recovered-${testInfo.project.name}-${testInfo.retry}`,
  });
  await page.getByRole("button", { name: "Retry and synchronize" }).click();
  await expect(
    page.getByText("Ready for supported offline activities"),
  ).toBeVisible();
});
