import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

test("renders a typed, degraded SEP Reading workspace without captured markup", async ({
  page,
}) => {
  await page.goto(`/sources/${sourceId}/${stateId}`);

  await expect(
    page.getByRole("heading", {
      name: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
    }),
  ).toBeVisible();
  await expect(page.getByText("Matthias Steup, Ram Neta")).toBeVisible();
  await expect(page.getByText("Reading degraded")).toBeVisible();
  await expect(
    page.getByText("An optional component was unavailable during capture."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect(page.getByAltText("Retained semantic diagram")).toHaveAttribute(
    "src",
    /^data:image\/gif;base64,/,
  );
  await expect(
    page.getByRole("navigation", { name: "Component contents" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Notation" })).toHaveAttribute(
    "href",
    "#notation",
  );
  await expect(page.locator("sub")).toHaveText("2");
  await expect(page.getByTitle("Original TeX source")).toHaveText(
    "\\frac{x}{2}",
  );
  await expect(
    page.getByRole("table", { name: "Observed distinctions" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "safe link" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(
    page.getByText("Rendering note: unsupported-tex-macro"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review Source information" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Source information", exact: true }),
  ).toHaveAttribute("href", /#source-information$/);

  await page.getByRole("button", { name: "Bibliography" }).click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Bibliography",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Search bibliography").fill("Steup");
  await expect(
    page.getByText("Steup, Matthias. 2023. Epistemology."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Publisher page/ }),
  ).toHaveAttribute("href", "https://example.com/epistemology");
  await expect(page.getByText("online only")).toBeVisible();
  await page.getByRole("button", { name: "Back to citation" }).click();
  await expect(
    page.getByRole("button", { name: "Citation: Steup 2023 (resolved)" }),
  ).toBeVisible();

  await expect(page.getByText("window.pwned = true")).toHaveCount(0);
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);

  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
    window.scrollTo(0, 240);
  });
  const componentSelector = page.getByLabel("Source component", {
    exact: true,
  });
  if (await componentSelector.isVisible()) {
    await componentSelector.selectOption("active:/notes.html");
  } else {
    const sourceComponents = page.getByRole("navigation", {
      name: "Source components",
    });
    await sourceComponents
      .getByText("Other components", { exact: true })
      .click();
    await sourceComponents.getByRole("button", { name: "Notes" }).click();
  }
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Component contents" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(240);
  await expect(
    page.getByText("Rendering note: missing-semantic-asset"),
  ).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousViolations).toEqual([]);
});
