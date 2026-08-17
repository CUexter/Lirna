import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the application shell and confirms API status", async ({
  page,
}) => {
  const apiResponse = page.waitForResponse((response) =>
    response.url().includes("/trpc/healthCheck"),
  );
  await page.goto("/");

  expect((await apiResponse).ok()).toBe(true);
  await expect(page).toHaveTitle("Lirna");
  await expect(page.getByRole("navigation")).toContainText("Home");
  await expect(page.getByRole("heading", { name: "API Status" })).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(seriousViolations).toEqual([]);
});
